import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { getGuestId } from "../../../../../stores/session";
import { currentSlot, makeToken, PERIOD_SEC } from "../../../../../lib/qr";

const SECRET = (process.env.EXPO_PUBLIC_QR_SECRET as string) || "DEV";

function resolveEventId(paramId?: string | string[]): string | null {
  const s = Array.isArray(paramId) ? paramId[0] : paramId;
  let v = s;
  if (!v || v === "undefined") {
    if (typeof window !== "undefined") {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "events");
      if (i >= 0 && parts[i + 1]) v = parts[i + 1];
    }
  }
  return v && v !== "undefined" ? v : null;
}

async function ensureGuest(): Promise<string> {
  try {
    const gid = await getGuestId();
    if (gid) return gid;
  } catch {}
  // safe fallback for web
  return "web-" + Math.random().toString(36).slice(2, 10);
}

export default function MyQRScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [eventId, setEventId] = useState<string | null>(resolveEventId(params.id));
  const [guestId, setGuestId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [remain, setRemain] = useState<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setEventId(resolveEventId(params.id));
  }, [params.id]);

  useEffect(() => {
    (async () => setGuestId(await ensureGuest()))();
  }, []);

  useEffect(() => {
    if (!eventId || !guestId) return;

    const update = async () => {
      const slot = currentSlot();
      const t = await makeToken(SECRET, eventId, guestId, slot);
      setToken(t);
      const sec = Math.floor(Date.now() / 1000);
      setRemain(PERIOD_SEC - (sec % PERIOD_SEC));
    };

    update();
    tickRef.current = setInterval(update, 1000);
    return () => {
      if (tickRef.current != null) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [eventId, guestId]);

  if (!eventId || !guestId || !token) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Preparing QR…</Text>
        {!eventId ? <Text style={styles.warn}>Open this from an event page.</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Check-in QR</Text>
      <View style={styles.qrBox}>
        <QRCode value={token} size={260} />
      </View>
      <Text style={styles.dim}>Rotates in {remain}s</Text>
      <Text style={styles.help}>Show this to the organizer to check in without GPS.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800" },
  qrBox: { padding: 16, backgroundColor: "#F3F4F6", borderRadius: 16 },
  dim: { color: "#6B7280" },
  warn: { color: "#9A3412" },
  help: { color: "#374151", marginTop: 6, textAlign: "center" },
});
