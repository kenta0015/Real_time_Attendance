import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Button, ActivityIndicator, Alert, Platform, Vibration, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../../../../lib/supabase";

type AttendanceRow = {
  event_id: string;
  user_id: string;
  checked_in_at_utc: string;
  method: string | null;
  comment: string | null;
};
type Counts = { event_id: string; total: number; qr_count: number; gps_count: number; unknown_count: number };

const LIST_LIMIT = 30;
const TOKEN_DEDUP_MS = 3000;           // dedupe same token (3s)
const BANNER_MS = 2200;                // success/error banner duration (~2.2s)
const AUTO_RESUME_MS = BANNER_MS + 200; // resume camera AFTER banner
const SCAN_COOLDOWN_MS = 800;          // same-frame multi-fire guard

export default function ScanQRScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(true);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"ok" | "ng" | null>(null); // banner

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);

  const busyRef = useRef(false);

  // token dedupe
  const tokenSeenAtRef = useRef<Map<string, number>>(new Map());
  const lastTokenRef = useRef<string | null>(null);
  const lastAtRef = useRef(0);

  // timers
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // frame multi-fire guard
  const scanCooldownUntilRef = useRef(0);

  const normalizeToken = (s: string) => String(s ?? "").replace(/\r?\n/g, "").trim();

  // ---- robust time formatter (fixes "Invalid Date") ----
  const fmtTime = (v: unknown): string => {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";

    // 1) add 'T'
    s = s.replace(" ", "T");

    // 2) trim microseconds to 3 digits (JSCは6桁を苦手とする)
    s = s.replace(/(\.\d{3})\d+/, "$1");

    // 3) timezone normalize: +HHMM -> +HH:MM, +HH -> +HH:00
    if (/[+-]\d{2}\d{2}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    else if (/[+-]\d{2}$/.test(s)) s = s + ":00";

    // 4) parse
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
    const { data } = await supabase
      .from("attendance")
      .select("event_id,user_id,checked_in_at_utc,method,comment")
      .eq("event_id", id)
      .order("checked_in_at_utc", { ascending: false })
      .limit(LIST_LIMIT);
    if (data) setRows(data as AttendanceRow[]);
    setLoadingList(false);
  }, [id]);

  const loadCounts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("attendance_counts").select("*").eq("event_id", id).maybeSingle();
    if (data) setCounts(data as Counts);
    else setCounts({ event_id: id, total: 0, qr_count: 0, gps_count: 0, unknown_count: 0 });
  }, [id]);

  useEffect(() => {
    (async () => { if (!permission) await requestPermission(); })();
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, [permission, requestPermission]);

  useEffect(() => { loadList(); loadCounts(); }, [loadList, loadCounts]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`att-live-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${id}` },
        () => { loadList(); loadCounts(); }
      )
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, [id, loadList, loadCounts]);

  const showBanner = useCallback((kind: "ok" | "ng", message: string) => {
    setLastMsg(message);
    setStatus(kind);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => setStatus(null), BANNER_MS);
  }, []);

  const isDupToken = (token: string, now: number) => {
    if (lastTokenRef.current === token && now - lastAtRef.current < TOKEN_DEDUP_MS) return true;
    const last = tokenSeenAtRef.current.get(token);
    if (last && now - last < TOKEN_DEDUP_MS) return true;
    return false;
  };

  const rememberToken = (token: string, when: number) => {
    lastTokenRef.current = token;
    lastAtRef.current = when;
    tokenSeenAtRef.current.set(token, when);
    if (tokenSeenAtRef.current.size > 256) {
      const cutoff = Date.now() - TOKEN_DEDUP_MS;
      for (const [k, t] of tokenSeenAtRef.current) if (t < cutoff) tokenSeenAtRef.current.delete(k);
    }
  };

  const handleScan = useCallback(
    async (token: string) => {
      if (!id) return;

      setBusy(true);
      busyRef.current = true;

      try {
        const { data, error } = await supabase.rpc("qr_checkin", { p_token: token });
        if (error) throw error;

        const row: any = Array.isArray(data) ? data[0] : data;
        const userId: string =
          row?.user_id ?? row?.out_user_id ?? row?.USER_ID ?? row?.OUT_USER_ID;
        const checkedAtRaw: unknown =
          row?.out_checked_in_at_utc ?? row?.checked_in_at_utc ?? row?.OUT_CHECKED_IN_AT_UTC ?? row?.CHECKED_IN_AT_UTC;

        const timeLabel = fmtTime(checkedAtRaw);
        const msg = timeLabel
          ? `Scan successful @ ${timeLabel} • ${short(userId)}`
          : `Scan successful • ${short(userId)}`;

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
    [id, showBanner]
  );

  const tryStartScan = useCallback(
    (raw: string) => {
      const now = Date.now();

      if (now < scanCooldownUntilRef.current) return;
      scanCooldownUntilRef.current = now + SCAN_COOLDOWN_MS;

      if (busyRef.current) return;

      const token = normalizeToken(raw);
      if (!token) return;

      if (isDupToken(token, now)) return; // silent ignore

      setScanning(false);
      busyRef.current = true;

      rememberToken(token, now);

      handleScan(token);
    },
    [handleScan]
  );

  const header = useMemo(
    () => (
      <View>
        {/* Success / Error banner */}
        {status ? (
          <View style={[styles.banner, status === "ok" ? styles.bannerOk : styles.bannerNg]}>
            <Text style={[styles.bannerText, status === "ok" ? styles.bannerTextOk : styles.bannerTextNg]}>
              {status === "ok" ? "Scan successful" : "Scan failed"}
            </Text>
          </View>
        ) : null}

        <Text style={styles.title}>Scan Check-in QR</Text>
        <View style={styles.scanner}>
          {scanning ? (
            <CameraView
              style={{ width: "100%", height: "100%" }}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanning && !busyRef.current ? (e) => tryStartScan((e as any).data) : undefined}
            />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={styles.dim}>Processing…</Text>
            </View>
          )}
        </View>

        <View style={{ height: 10 }} />
        <Button title="Scan again" onPress={() => setScanning(true)} disabled={busy} />
        {lastMsg ? <Text style={styles.last}>{lastMsg}</Text> : null}

        <Text style={[styles.section, { marginTop: 16 }]}>Summary</Text>
        <Text style={styles.summary}>
          Total: {counts?.total ?? 0} • QR: {counts?.qr_count ?? 0} • GPS: {counts?.gps_count ?? 0} • Unknown: {counts?.unknown_count ?? 0}
        </Text>

        <Text style={[styles.section, { marginTop: 12 }]}>Recent arrivals</Text>
      </View>
    ),
    [scanning, busy, lastMsg, counts, status, tryStartScan]
  );

  if (!permission || !permission.granted) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Requesting camera permission…</Text>
        {!permission?.granted ? <Button title="Grant camera access" onPress={requestPermission} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(x) => `${x.event_id}-${x.user_id}-${x.checked_in_at_utc}`}
        ListHeaderComponent={header}
        refreshing={loadingList}
        onRefresh={() => { loadList(); loadCounts(); }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.uid}>{short(item.user_id)}</Text>
            <Text style={styles.meta}>
              {fmtTime(item.checked_in_at_utc)} • {item.method ?? "—"}
              {item.comment ? ` • ${item.comment}` : ""}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.center, { paddingVertical: 24 }]}><Text style={styles.dim}>No arrivals yet.</Text></View>
        }
      />
    </View>
  );
}

function short(id?: string) {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { alignItems: "center", justifyContent: "center", padding: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: "800", padding: 16, paddingBottom: 8 },
  section: { fontSize: 16, fontWeight: "700", paddingHorizontal: 16, marginBottom: 8 },
  summary: { paddingHorizontal: 16, color: "#374151" },
  scanner: { height: 360, borderRadius: 12, overflow: "hidden", backgroundColor: "#111827", marginHorizontal: 16 },
  dim: { color: "#6B7280" },
  last: { marginTop: 8, color: "#374151", textAlign: "center" },

  // list
  sep: { height: 1, backgroundColor: "#eee", marginHorizontal: 16 },
  row: { paddingHorizontal: 16, paddingVertical: 10 },
  uid: { fontSize: 16, fontWeight: "700", color: "#111827" },
  meta: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  // banners
  banner: { marginHorizontal: 16, marginTop: 10, marginBottom: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  bannerOk: { backgroundColor: "#E6F6ED", borderWidth: 1, borderColor: "#34D399" },
  bannerNg: { backgroundColor: "#FDE8E8", borderWidth: 1, borderColor: "#F87171" },
  bannerText: { textAlign: "center", fontWeight: "700" },
  bannerTextOk: { color: "#065F46" },
  bannerTextNg: { color: "#7F1D1D" },
});
