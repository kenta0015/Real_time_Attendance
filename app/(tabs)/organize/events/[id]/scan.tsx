// app/organize/events/[id]/scan.tsx
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Vibration,
  FlatList,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../../../../../lib/supabase";
import { verifyToken, currentSlot } from "../../../../../lib/qr";
import Button from "../../../../ui/Button";
import Card from "../../../../ui/Card";
import { COLORS, SPACING, RADIUS } from "@ui/theme";

type AttendanceRow = {
  event_id: string;
  user_id: string;
  checked_in_at_utc: string;
  method: string | null;
  comment: string | null;
};
type Counts = {
  event_id: string;
  total: number;
  qr_count: number;
  gps_count: number;
  unknown_count: number;
};

const LIST_LIMIT = 30;
const TOKEN_DEDUP_MS = 3000;
const BANNER_MS = 2200;
const AUTO_RESUME_MS = BANNER_MS + 200;
const SCAN_COOLDOWN_MS = 800;

const RATE_WINDOW_MS = 60_000;
const MAX_SCANS_PER_WINDOW = 8;
const RATE_LIMIT_PAUSE_MS = 15_000;

const USER_COOLDOWN_MS = 60_000;

const SECRET = (process.env.EXPO_PUBLIC_QR_SECRET as string) || "DEV";
const MAX_AGE_SLOTS = 2;

const PIN_LENGTH = 4;
const PIN_TTL_MS = 20 * 60 * 1000;

function makePin(len = PIN_LENGTH) {
  const n = Math.floor(Math.random() * Math.pow(10, len));
  return n.toString().padStart(len, "0");
}

function tryDecodeOnce(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function robustNormalizeToken(raw: string): string {
  if (!raw) return "";
  let t = String(raw).trim().replace(/\r?\n/g, "");

  // If a URL, extract ?token=
  if (/^(https?:\/\/|rta:\/\/)/i.test(t)) {
    try {
      const u = new URL(t);
      const q = u.searchParams.get("token");
      if (q) t = q;
    } catch {}
  } else if (/token=/i.test(t)) {
    try {
      const qs = t.includes("?") ? t.split("?").slice(1).join("?") : t;
      const sp = new URLSearchParams(qs);
      const q = sp.get("token");
      if (q) t = q;
    } catch {}
  }

  // Decode up to 3 times to collapse %257C -> %7C -> |
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = tryDecodeOnce(t);
    if (t === before) break;
  }

  // Remove spaces around pipes
  t = t.replace(/\s*\|\s*/g, "|");
  return t;
}

function mapServerError(msg: string): string {
  const m = (msg || "").toLowerCase();

  if (m.includes("invalid token")) return "Invalid QR code.";
  if (m.includes("bad token")) return "Invalid QR code.";
  if (m.includes("unsupported")) return "Unsupported QR type.";
  if (m.includes("token too old") || m.includes("expired"))
    return "This QR has expired. Please refresh and try again.";
  if (m.includes("pin required")) return "PIN required for this event.";
  if (m.includes("wrong pin") || m.includes("pin mismatch"))
    return "Incorrect PIN. Please try again.";
  if (m.includes("event mismatch") || m.includes("wrong event"))
    return "This QR is for another event.";
  if (m.includes("already")) return "Already checked in.";
  if (m.includes("cooldown") || m.includes("rate"))
    return "Duplicate scan detected. Please wait a moment.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Network unavailable. Please check your connection.";
  if (m.includes("timeout")) return "Service timeout. Please try again.";
  if (m.match(/\b5\d{2}\b/) || m.includes("server error"))
    return "Service temporarily unavailable. Please try again.";

  return `Unexpected error. Please try again. (${msg})`;
}

export default function ScanQRScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(true);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"ok" | "ng" | null>(null);

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);

  // debug
  const [rawDebug, setRawDebug] = useState<string | null>(null);
  const [tokenDebug, setTokenDebug] = useState<string | null>(null);

  // session PIN
  const [pin, setPin] = useState<string>("");
  const [pinExpiresAt, setPinExpiresAt] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const busyRef = useRef(false);

  // token dedupe
  const tokenSeenAtRef = useRef<Map<string, number>>(new Map());
  const lastTokenRef = useRef<string | null>(null);
  const lastAtRef = useRef(0);

  // timers
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanCooldownUntilRef = useRef(0);
  const rotateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // rate limit window
  const scanTimesRef = useRef<number[]>([]);
  const rateLimitedUntilRef = useRef(0);
  const rateResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // same user cooldown
  const recentUserAtRef = useRef<Map<string, number>>(new Map());

  const short = (s: string) =>
    s?.length > 6 ? s.slice(0, 3) + "…" + s.slice(-3) : s ?? "";

  const isDupToken = (token: string, now: number) => {
    const last = tokenSeenAtRef.current.get(token) ?? 0;
    if (now - last < TOKEN_DEDUP_MS) return true;
    tokenSeenAtRef.current.set(token, now);
    lastTokenRef.current = token;
    lastAtRef.current = now;
    return false;
  };

  const showBanner = useCallback((kind: "ok" | "ng", msg: string) => {
    setStatus(kind);
    setLastMsg(msg);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setStatus(null), BANNER_MS);
  }, []);

  const fmtTime = (unknown: unknown): string => {
    if (typeof unknown !== "string") return "";
    let s = unknown as string;
    if (/^\d{4}-\d{2}-\d2T\d{2}:\d{2}:\d{2}$/.test(s)) s += "Z";
    else if (/[+-]\d{2}$/.test(s)) s = s + ":00";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    try {
      return d.toLocaleTimeString();
    } catch {
      return "";
    }
  };

  const loadList = useCallback(async () => {
    if (!id) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("event_id,user_id,checked_in_at_utc,method,comment")
      .eq("event_id", id)
      .order("checked_in_at_utc", { ascending: false })
      .limit(LIST_LIMIT);
    if (!error && data) setRows(data as AttendanceRow[]);
    setLoadingList(false);
  }, [id]);

  const loadCounts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("attendance_counts")
      .select("*")
      .eq("event_id", id)
      .maybeSingle();
    if (data) setCounts(data as Counts);
    else
      setCounts({
        event_id: String(id),
        total: 0,
        qr_count: 0,
        gps_count: 0,
        unknown_count: 0,
      });
  }, [id]);

  useEffect(() => {
    loadList();
    loadCounts();
  }, [loadList, loadCounts]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`att-live-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `event_id=eq.${id}`,
        },
        () => {
          loadList();
          loadCounts();
        }
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [id, loadList, loadCounts]);

  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const rotatePin = useCallback(() => {
    const p = makePin();
    setPin(p);
    const exp = Date.now() + PIN_TTL_MS;
    setPinExpiresAt(exp);
    if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
    rotateTimerRef.current = setTimeout(rotatePin, PIN_TTL_MS);
  }, []);
  useEffect(() => {
    rotatePin();
    return () => {
      if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current);
    };
  }, [rotatePin]);

  const pinRemainingMs = Math.max(0, pinExpiresAt - nowTick);
  const pinExpired = pin.length > 0 && pinExpiresAt > 0 && pinRemainingMs <= 0;

  useEffect(() => {
    if (pinExpired) {
      setScanning(false);
      showBanner("ng", "PIN expired. Tap Rotate PIN to continue.");
      Vibration.vibrate([0, 20, 60]);
    }
  }, [pinExpired, showBanner]);

  const handleScan = useCallback(
    async (rawToken: string) => {
      if (!id) return;
      setBusy(true);
      busyRef.current = true;
      try {
        if (pinExpired) {
          showBanner("ng", "PIN expired. Tap Rotate PIN to continue.");
          Vibration.vibrate([0, 30, 80]);
          return;
        }

        const token = robustNormalizeToken(rawToken);

        // Quick event check (before any RPC)
        const parts = token.split("|");
        if (parts.length === 5 && parts[0] === "v1") {
          const eventFromToken = parts[1];
          if (
            String(eventFromToken).toLowerCase() !== String(id).toLowerCase()
          ) {
            setTokenDebug(token);
            console.log(
              "[ORG-SCAN] event mismatch",
              "routeId=",
              id,
              "tokenEvent=",
              eventFromToken
            );
            showBanner("ng", "This QR is for another event.");
            Vibration.vibrate([0, 30, 80]);
            return;
          }
        }

        // Verify signature/slot
        const parsed = await verifyToken(SECRET, token);
        if (!parsed) {
          setTokenDebug(token);
          console.log("TOKEN_INVALID token=", token);
          showBanner("ng", "Invalid QR code.");
          Vibration.vibrate([0, 30, 80]);
          return;
        }

        const drift = currentSlot() - parsed.slot;
        if (drift >= MAX_AGE_SLOTS) {
          setTokenDebug(token);
          console.log("TOKEN_OLD token=", token);
          showBanner("ng", "This QR has expired. Please refresh and try again.");
          Vibration.vibrate([0, 30, 80]);
          return;
        }

        // RPC (always send route id as p_event_id)
        let data: any, error: any;
        try {
          const payload: any = {
            p_token: token,
            p_pin: pin,
            p_device: Platform.OS,
            p_event_id: String(id),
          };
          console.log("[ORG-SCAN] calling qr_checkin_with_pin payload=", {
            p_event_id: payload.p_event_id,
          });
          const resp = await supabase.rpc("qr_checkin_with_pin", payload);
          data = resp.data;
          error = resp.error;
          if (error) throw error;
        } catch (err: any) {
          const msg = String(err?.message ?? "");
          if (
            msg.toLowerCase().includes("checkin_with_pin") ||
            msg.toLowerCase().includes("not exist") ||
            msg.toLowerCase().includes("unknown function") ||
            msg.toLowerCase().includes("unexpected")
          ) {
            const resp2 = await supabase.rpc("qr_checkin", {
              p_token: token,
              p_event_id: String(id),
            });
            data = resp2.data;
            error = resp2.error;
            if (error) throw error;
          } else {
            throw err;
          }
        }

        const row: any = Array.isArray(data) ? data[0] : data;
        const userId: string =
          row?.user_id ??
          row?.out_user_id ??
          row?.USER_ID ??
          row?.OUT_USER_ID;
        const checkedAtRaw: unknown =
          row?.out_checked_in_at_utc ??
          row?.checked_in_at_utc ??
          row?.OUT_CHECKED_IN_AT_UTC ??
          row?.CHECKED_IN_AT_UTC;

        // Same-user cooldown
        const now = Date.now();
        const prev = recentUserAtRef.current.get(userId) ?? 0;
        if (now - prev < USER_COOLDOWN_MS) {
          const remain = Math.ceil((USER_COOLDOWN_MS - (now - prev)) / 1000);
          showBanner(
            "ng",
            `Duplicate scan for the same user. Please wait ${remain}s.`
          );
          Vibration.vibrate([0, 30, 80]);
          loadList();
          loadCounts();
          return;
        }
        recentUserAtRef.current.set(userId, now);

        loadList();
        loadCounts();

        const timeLabel = fmtTime(checkedAtRaw);
        const msg = timeLabel
          ? `Checked in at ${timeLabel} • ${short(userId)}`
          : `Checked in • ${short(userId)}`;
        showBanner("ok", msg);
        Vibration.vibrate(40);
      } catch (e: any) {
        const mapped = mapServerError(String(e?.message ?? ""));
        showBanner("ng", mapped);
        Vibration.vibrate([0, 20, 60]);
        if (Platform.OS !== "android") Alert.alert("Error", mapped);
      } finally {
        setBusy(false);
        busyRef.current = false;
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => setScanning(true), AUTO_RESUME_MS);
      }
    },
    [id, showBanner, loadList, loadCounts, pin, pinExpired]
  );

  const tryStartScan = useCallback(
    (raw: string) => {
      setRawDebug(raw);
      console.log("RAW_SCAN =", raw);

      const now = Date.now();

      if (pinExpired) {
        showBanner("ng", "PIN expired. Tap Rotate PIN to continue.");
        return;
      }

      if (now < rateLimitedUntilRef.current) {
        const remain = Math.ceil(
          (rateLimitedUntilRef.current - now) / 1000
        );
        showBanner("ng", `Rate limited. Please wait ${remain}s.`);
        return;
      }

      if (now < scanCooldownUntilRef.current) return;
      scanCooldownUntilRef.current = now + SCAN_COOLDOWN_MS;

      if (busyRef.current) return;

      const times = scanTimesRef.current.filter((t) => now - t <= RATE_WINDOW_MS);
      times.push(now);
      scanTimesRef.current = times;
      if (times.length > MAX_SCANS_PER_WINDOW) {
        rateLimitedUntilRef.current = now + RATE_LIMIT_PAUSE_MS;
        setScanning(false);
        showBanner(
          "ng",
          `Too many scans. Pausing for ${Math.ceil(
            RATE_LIMIT_PAUSE_MS / 1000
          )}s.`
        );
        try {
          Vibration.vibrate([0, 30, 80]);
        } catch {}
        if (rateResumeTimerRef.current) clearTimeout(rateResumeTimerRef.current);
        rateResumeTimerRef.current = setTimeout(
          () => setScanning(true),
          RATE_LIMIT_PAUSE_MS
        );
        return;
      }

      const token = robustNormalizeToken(raw);
      if (!token) {
        showBanner("ng", "Unsupported QR type.");
        return;
      }
      if (isDupToken(token, now)) return;

      setScanning(false);
      busyRef.current = true;
      handleScan(token);
    },
    [handleScan, showBanner, pinExpired]
  );

  const handleRotateNow = useCallback(() => {
    rotatePin();
    setScanning(true);
    showBanner("ok", "PIN rotated.");
  }, [rotatePin, showBanner]);

  const headerBlock = useMemo(() => {
    const ttlSec = Math.ceil(Math.max(0, pinExpiresAt - nowTick) / 1000);
    const ttlDanger = ttlSec <= 30;
    const ttlWarn = ttlSec > 30 && ttlSec <= 120;

    return (
      <View>
        <Card variant="soft" style={{ margin: SPACING.md }}>
          {status ? (
            <View style={[styles.banner, status === "ok" ? styles.bannerOk : styles.bannerNg]}>
              <Text style={[styles.bannerText, status === "ok" ? styles.bannerTextOk : styles.bannerTextNg]}>
                {status === "ok" ? "Scan successful" : "Scan failed"}
              </Text>
              {!!lastMsg && (
                <Text style={[styles.bannerMsg, status === "ok" ? styles.bannerTextOk : styles.bannerTextNg]}>
                  {lastMsg}
                </Text>
              )}
            </View>
          ) : null}

          <Text style={styles.title}>Scan QR</Text>

          <View style={styles.rowH}>
            <Text style={styles.dim}>Event:</Text>
            <Text style={styles.mono}>{String(id)}</Text>
          </View>

          <View style={styles.pinRow}>
            <Text style={styles.pinLabel}>Session PIN</Text>
            <Text style={[styles.pinValue, pinExpired ? styles.pinExpired : undefined]}>{pin || "----"}</Text>
            <Text
              style={[
                styles.pinTtl,
                pinExpired ? styles.ttlExpired : ttlDanger ? styles.ttlDanger : ttlWarn ? styles.ttlWarn : styles.ttlOk,
              ]}
            >
              {pinExpired ? "Expired" : `Rotates in ${ttlSec}s`}
            </Text>
            <Button title="Rotate PIN" onPress={handleRotateNow} size="sm" variant="outline" />
          </View>

          {counts ? (
            <View style={styles.counts}>
              <Text style={styles.countText}>Total: {counts.total}</Text>
              <Text style={styles.countText}>QR: {counts.qr_count}</Text>
              <Text style={styles.countText}>GPS: {counts.gps_count}</Text>
              <Text style={styles.countText}>Unknown: {counts.unknown_count}</Text>
            </View>
          ) : null}
        </Card>

        <Card variant="outlined" style={{ marginHorizontal: SPACING.md, marginTop: SPACING.sm }}>
          {permission?.granted ? (
            scanning && !busyRef.current ? (
              <CameraView
                style={{ height: 320, borderRadius: RADIUS.lg }}
                facing="back"
                onBarcodeScanned={
                  scanning && !busyRef.current ? (e) => tryStartScan((e as any).data) : undefined
                }
              />
            ) : (
              <View style={[styles.center, { height: 320 }]}>
                <ActivityIndicator />
                <Text style={styles.dim}>
                  {pinExpired ? "PIN expired. Tap Rotate PIN to continue." : "Processing…"}
                </Text>
              </View>
            )
          ) : (
            <View style={[styles.center, { height: 220, gap: SPACING.sm }]}>
              <ActivityIndicator />
              <Text style={styles.dim}>Requesting camera permission…</Text>
              {!permission?.granted ? (
                <Button title="Grant camera access" onPress={requestPermission} variant="primary" />
              ) : null}
            </View>
          )}
        </Card>

        <View style={{ height: SPACING.sm }} />
        <View style={{ paddingHorizontal: SPACING.md }}>
          <Button title="Scan again" onPress={() => setScanning(true)} disabled={busy || pinExpired} fullWidth />
          {lastMsg ? <Text style={styles.last}>{lastMsg}</Text> : null}
        </View>

        {rawDebug ? <Text selectable style={styles.debug}>RAW: {rawDebug}</Text> : null}
        {tokenDebug ? <Text selectable style={styles.debug}>TOKEN: {tokenDebug}</Text> : null}

        <View style={{ marginTop: SPACING.md, paddingHorizontal: SPACING.md }}>
          <Text style={styles.section}>Recent Check-ins</Text>
        </View>
      </View>
    );
  }, [
    id,
    status,
    counts,
    pin,
    pinExpiresAt,
    nowTick,
    pinExpired,
    handleRotateNow,
    lastMsg,
    permission?.granted,
    requestPermission,
    scanning,
    busy,
    rawDebug,
    tokenDebug,
    tryStartScan,
  ]);

  const renderRow = useCallback(
    ({ item }: { item: AttendanceRow }) => (
      <View style={{ paddingHorizontal: SPACING.md }}>
        <Card>
          <View style={styles.itemRow}>
            <Text style={styles.uid}>{short(item.user_id)}</Text>
            <Text style={styles.metaText}>
              {fmtTime(item.checked_in_at_utc)} • {item.method ?? "—"}
              {item.comment ? ` • ${item.comment}` : ""}
            </Text>
          </View>
        </Card>
      </View>
    ),
    []
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ paddingBottom: SPACING.lg }}
      data={rows}
      keyExtractor={(r) => `${r.event_id}:${r.user_id}:${r.checked_in_at_utc}`}
      renderItem={renderRow}
      ListHeaderComponent={headerBlock}
      ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
      ListEmptyComponent={
        loadingList ? (
          <View style={[styles.center, { paddingVertical: SPACING.lg }]}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={{ paddingHorizontal: SPACING.md }}>
            <Card>
              <View style={[styles.center, { paddingVertical: SPACING.lg }]}>
                <Text style={styles.dim}>No check-ins yet</Text>
              </View>
            </Card>
          </View>
        )
      }
      refreshing={loadingList}
      onRefresh={() => {
        loadList();
        loadCounts();
      }}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 6 },
  rowH: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dim: { color: COLORS.textMuted },
  mono: {
    color: COLORS.text,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },

  // session pin styles
  pinRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap" },
  pinLabel: { color: COLORS.textMuted },
  pinValue: { color: COLORS.text, fontWeight: "900", fontSize: 18, letterSpacing: 1 },
  pinExpired: { color: COLORS.danger },
  pinTtl: { color: COLORS.textMuted },
  ttlOk: { color: COLORS.success },
  ttlWarn: { color: "#b45309" },
  ttlDanger: { color: COLORS.danger },
  ttlExpired: { color: COLORS.danger },

  counts: { flexDirection: "row", gap: SPACING.sm, marginTop: 6, flexWrap: "wrap" },
  countText: { color: COLORS.text },

  center: { alignItems: "center", justifyContent: "center" },

  last: { marginTop: 6, color: COLORS.text, textAlign: "center" },

  section: { color: COLORS.text, fontWeight: "800", fontSize: 16, marginBottom: 8 },

  // list (row)
  itemRow: { paddingHorizontal: SPACING.md, paddingVertical: 10 },
  uid: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  metaText: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  // banners
  banner: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  bannerOk: { backgroundColor: "#E6F6ED", borderColor: COLORS.success },
  bannerNg: { backgroundColor: "#FDE8E8", borderColor: COLORS.danger },
  bannerText: { textAlign: "center", fontWeight: "800" },
  bannerTextOk: { color: COLORS.success },
  bannerTextNg: { color: COLORS.danger },
  bannerMsg: { textAlign: "center", marginTop: 4 },

  // debug text
  debug: { fontSize: 10, color: COLORS.textMuted, marginTop: 6, paddingHorizontal: SPACING.md },
});
