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
import { supabase } from "../../../../lib/supabase";
import { verifyToken, currentSlot, PERIOD_SEC } from "../../../../lib/qr";
import { STR } from "../../../../lib/strings";

// Common UI
import Button from "../../../ui/Button";
import Card from "../../../ui/Card";
// Tokens
import { COLORS, SPACING, RADIUS } from "../../../ui/theme";

type AttendanceRow = {
  event_id: string;
  user_id: string;
  checked_in_at_utc: string;
  method: string | null;
  comment: string | null;
};
type Counts = { event_id: string; total: number; qr_count: number; gps_count: number; unknown_count: number };

const LIST_LIMIT = 30;
const TOKEN_DEDUP_MS = 3000;
const BANNER_MS = 2200;
const AUTO_RESUME_MS = BANNER_MS + 200;
const SCAN_COOLDOWN_MS = 800;

// 5-A
const RATE_WINDOW_MS = 60_000;
const MAX_SCANS_PER_WINDOW = 8;
const RATE_LIMIT_PAUSE_MS = 15_000;

// 5-C
const USER_COOLDOWN_MS = 60_000;

// 5-D
const SECRET = (process.env.EXPO_PUBLIC_QR_SECRET as string) || "DEV";
const MAX_AGE_SLOTS = 2;

// 5-E/5-F
const PIN_LENGTH = 4;
const PIN_TTL_MS = 20 * 60 * 1000;

function makePin(len = PIN_LENGTH) {
  const n = Math.floor(Math.random() * Math.pow(10, len));
  return n.toString().padStart(len, "0");
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

  // 5-A rate limit
  const scanTimesRef = useRef<number[]>([]);
  const rateLimitedUntilRef = useRef(0);
  const rateResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 5-C recent same-user scans
  const recentUserAtRef = useRef<Map<string, number>>(new Map());

  // helpers
  const short = (s: string) => (s?.length > 6 ? s.slice(0, 3) + "…" + s.slice(-3) : s ?? "");
  const normalizeToken = (raw: string) => {
    if (!raw) return "";
    let t = raw.trim();
    const m = t.match(/[?&]token=([A-Za-z0-9._-]+)/);
    if (m) t = m[1];
    return t;
  };
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
    try { return d.toLocaleTimeString(); } catch { return ""; }
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
    const { data } = await supabase.from("attendance_counts").select("*").eq("event_id", id).maybeSingle();
    if (data) setCounts(data as Counts);
    else setCounts({ event_id: String(id), total: 0, qr_count: 0, gps_count: 0, unknown_count: 0 });
  }, [id]);

  useEffect(() => { loadList(); loadCounts(); }, [loadList, loadCounts]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`att-live-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${id}` }, () => {
        loadList(); loadCounts();
      })
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
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
  useEffect(() => { rotatePin(); return () => { if (rotateTimerRef.current) clearTimeout(rotateTimerRef.current); }; }, [rotatePin]);

  const pinRemainingMs = Math.max(0, pinExpiresAt - nowTick);
  const pinExpired = pin.length > 0 && pinExpiresAt > 0 && pinRemainingMs <= 0;

  useEffect(() => {
    if (pinExpired) {
      setScanning(false);
      showBanner("ng", STR.pinExpiredRotate);
      Vibration.vibrate([0, 20, 60]);
    }
  }, [pinExpired, showBanner]);

  const handleScan = useCallback(
    async (token: string) => {
      if (!id) return;
      setBusy(true);
      busyRef.current = true;
      try {
        if (pinExpired) {
          showBanner("ng", STR.pinExpiredResume);
          Vibration.vibrate([0, 30, 80]);
          return;
        }

        const parsed = await verifyToken(SECRET, token);
        if (!parsed) {
          setTokenDebug(token);
          console.log("TOKEN_INVALID token=", token);
          showBanner("ng", "Invalid QR token");
          Vibration.vibrate([0, 30, 80]);
          return;
        }
        const drift = currentSlot() - parsed.slot;
        if (drift >= MAX_AGE_SLOTS) {
          setTokenDebug(token);
          console.log("TOKEN_OLD token=", token);
          const age = drift * PERIOD_SEC;
          showBanner("ng", `QR too old (~${age}s). Ask to refresh.`);
          Vibration.vibrate([0, 30, 80]);
          return;
        }

        let data: any, error: any;
        try {
          const payload: any = { p_token: token, p_pin: pin, p_device: Platform.OS, p_event_id: String(id) };
          const resp = await supabase.rpc("qr_checkin_with_pin", payload);
          data = resp.data; error = resp.error;
          if (error) throw error;
        } catch (err: any) {
          const msg = String(err?.message ?? "").toLowerCase();
          if (msg.includes("checkin_with_pin") || msg.includes("not exist") || msg.includes("unknown function") || msg.includes("unexpected")) {
            const resp2 = await supabase.rpc("qr_checkin", { p_token: token, p_event_id: String(id) });
            data = resp2.data; error = resp2.error;
            if (error) throw error;
          } else {
            throw err;
          }
        }

        const row: any = Array.isArray(data) ? data[0] : data;
        const userId: string = row?.user_id ?? row?.out_user_id ?? row?.USER_ID ?? row?.OUT_USER_ID;
        const checkedAtRaw: unknown = row?.out_checked_in_at_utc ?? row?.checked_in_at_utc ?? row?.OUT_CHECKED_IN_AT_UTC ?? row?.CHECKED_IN_AT_UTC;

        const now = Date.now();
        const prev = recentUserAtRef.current.get(userId) ?? 0;
        if (now - prev < USER_COOLDOWN_MS) {
          const remain = Math.ceil((USER_COOLDOWN_MS - (now - prev)) / 1000);
          showBanner("ng", `Same user scanned again • wait ${remain}s`);
          Vibration.vibrate([0, 30, 80]);
          loadList(); loadCounts();
          return;
        }
        recentUserAtRef.current.set(userId, now);

        loadList();
        loadCounts();

        const timeLabel = fmtTime(checkedAtRaw);
        const msg = timeLabel ? `Scan @ ${timeLabel} • ${short(userId)}` : `Scan successful • ${short(userId)}`;
        showBanner("ok", msg);
        Vibration.vibrate(40);
      } catch (e: any) {
        const msg = e?.message ?? "Scan failed";
        showBanner("ng", `Scan failed • ${msg}`);
        Vibration.vibrate([0, 20, 60]);
        if (Platform.OS !== "android") Alert.alert("Error", msg);
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
        showBanner("ng", STR.pinExpiredResume);
        return;
      }

      if (now < rateLimitedUntilRef.current) {
        const remain = Math.ceil((rateLimitedUntilRef.current - now) / 1000);
        showBanner("ng", `Rate limited • wait ${remain}s`);
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
        showBanner("ng", `Too many scans • pausing ${Math.ceil(RATE_LIMIT_PAUSE_MS / 1000)}s`);
        try { Vibration.vibrate([0, 30, 80]); } catch {}
        if (rateResumeTimerRef.current) clearTimeout(rateResumeTimerRef.current);
        rateResumeTimerRef.current = setTimeout(() => setScanning(true), RATE_LIMIT_PAUSE_MS);
        return;
      }

      const token = normalizeToken(raw);
      if (!token) return;
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
    showBanner("ok", STR.rotatePin);
  }, [rotatePin, showBanner]);

  const header = useMemo(() => {
    const ttlSec = Math.ceil(Math.max(0, pinExpiresAt - nowTick) / 1000);
    const ttlDanger = ttlSec <= 30;
    const ttlWarn = ttlSec > 30 && ttlSec <= 120;
    return (
      <View>
        {status ? (
          <View style={[styles.banner, status === "ok" ? styles.bannerOk : styles.bannerNg]}>
            <Text style={[styles.bannerText, status === "ok" ? styles.bannerTextOk : styles.bannerTextNg]}>
              {status === "ok" ? STR.scanSuccess : STR.scanFailed}
            </Text>
            {!!lastMsg && <Text style={[styles.bannerMsg, status === "ok" ? styles.bannerTextOk : styles.bannerTextNg]}>{lastMsg}</Text>}
          </View>
        ) : null}

        <Text style={styles.title}>{STR.scanQR}</Text>
        <View style={styles.rowH}>
          <Text style={styles.dim}>{STR.event}:</Text>
          <Text style={styles.mono}>{String(id)}</Text>
        </View>

        <View style={styles.pinRow}>
          <Text style={styles.pinLabel}>{STR.sessionPin}</Text>
          <Text style={[styles.pinValue, pinExpired ? styles.pinExpired : undefined]}>{pin || "----"}</Text>
          <Text
            style={[
              styles.pinTtl,
              pinExpired ? styles.ttlExpired : ttlDanger ? styles.ttlDanger : ttlWarn ? styles.ttlWarn : styles.ttlOk,
            ]}
          >
            {pinExpired ? STR.expired : `${STR.rotatesIn} ${ttlSec}s`}
          </Text>
          <Button title={STR.rotatePin} onPress={handleRotateNow} size="sm" variant="outline" />
        </View>

        {counts ? (
          <View style={styles.counts}>
            <Text style={styles.countText}>Total: {counts.total}</Text>
            <Text style={styles.countText}>QR: {counts.qr_count}</Text>
            <Text style={styles.countText}>GPS: {counts.gps_count}</Text>
            <Text style={styles.countText}>Unknown: {counts.unknown_count}</Text>
          </View>
        ) : null}
      </View>
    );
  }, [id, status, counts, pin, pinExpiresAt, nowTick, pinExpired, handleRotateNow, lastMsg]);

  return (
    <View style={styles.container}>
      <Card variant="soft" style={{ margin: SPACING.md }}>{header}</Card>

      <Card variant="outlined" style={{ marginHorizontal: SPACING.md, marginTop: SPACING.sm }}>
        {permission?.granted ? (
          scanning && !busyRef.current ? (
            <CameraView
              style={{ height: 320, borderRadius: RADIUS.lg }}
              facing="back"
              onBarcodeScanned={scanning && !busyRef.current ? (e) => tryStartScan((e as any).data) : undefined}
            />
          ) : (
            <View style={[styles.center, { height: 320 }]}>
              <ActivityIndicator />
              <Text style={styles.dim}>{pinExpired ? STR.pinExpiredRotate : STR.processing}</Text>
            </View>
          )
        ) : (
          <View style={[styles.center, { height: 220, gap: SPACING.sm }]}>
            <ActivityIndicator />
            <Text style={styles.dim}>{STR.requestingCameraPermission}</Text>
            {!permission?.granted ? (
              <Button title={STR.grantCameraAccess} onPress={requestPermission} variant="primary" />
            ) : null}
          </View>
        )}
      </Card>

      <View style={{ height: SPACING.sm }} />
      <View style={{ paddingHorizontal: SPACING.md }}>
        <Button title={STR.scanAgain} onPress={() => setScanning(true)} disabled={busy || pinExpired} fullWidth />
        {lastMsg ? <Text style={styles.last}>{lastMsg}</Text> : null}
      </View>

      {/* Debug output */}
      {rawDebug ? <Text selectable style={styles.debug}>RAW: {rawDebug}</Text> : null}
      {tokenDebug ? <Text selectable style={styles.debug}>TOKEN: {tokenDebug}</Text> : null}

      <View style={{ marginTop: SPACING.md, paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg }}>
        <Text style={styles.section}>Recent Check-ins</Text>
        <Card>
          {loadingList ? (
            <View style={[styles.center, { paddingVertical: SPACING.lg }]}>
              <ActivityIndicator />
            </View>
          ) : rows.length === 0 ? (
            <View style={[styles.center, { paddingVertical: SPACING.lg }]}>
              <Text style={styles.dim}>{STR.noCheckinsYet}</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => `${r.event_id}:${r.user_id}:${r.checked_in_at_utc}`}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <View style={styles.itemRow}>
                  <Text style={styles.uid}>{short(item.user_id)}</Text>
                  <Text style={styles.metaText}>
                    {fmtTime(item.checked_in_at_utc)} • {item.method ?? "—"}
                    {item.comment ? ` • ${item.comment}` : ""}
                  </Text>
                </View>
              )}
            />
          )}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

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

  // list
  sep: { height: 1, backgroundColor: COLORS.border },
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
