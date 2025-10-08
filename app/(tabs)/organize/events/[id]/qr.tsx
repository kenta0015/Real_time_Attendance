/// <reference lib="dom" />


// app/(tabs)/organize/events/[id]/qr.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Share } from "react-native";
import { useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { getGuestId } from "../../../../../stores/session";
import { currentSlot, makeToken, PERIOD_SEC } from "../../../../../lib/qr";
import { STR } from "../../../../../lib/strings";

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
  if (!v || v === "undefined") return null;
  return v;
}

export default function Screen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = resolveEventId(params?.id);

  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [slot, setSlot] = useState<number>(currentSlot());
  const [loading, setLoading] = useState(true);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => setUserId(await getGuestId()))();
  }, []);

  const rebuild = async (s: number) => {
    if (!eventId || !userId) return;
    // FIX: argument order (secret, then slot number)
    const t = await makeToken(eventId, userId, SECRET, s);
    setToken(t);
  };

  // slot ticker (refresh QR every PERIOD_SEC)
  useEffect(() => {
    setLoading(true);
    let mounted = true;

    const boot = async () => {
      const s = currentSlot();
      setSlot(s);
      await rebuild(s);
      if (mounted) setLoading(false);
    };
    boot();

    intervalRef.current = setInterval(async () => {
      const s = currentSlot();
      setSlot(s);
      await rebuild(s);
    }, 1000);

    return () => {
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [eventId, userId]);

  const secondsIntoSlot = useMemo(() => Math.floor((Date.now() / 1000) % PERIOD_SEC), [slot, token]);
  const remaining = PERIOD_SEC - (secondsIntoSlot % PERIOD_SEC);
  const progress = 1 - remaining / PERIOD_SEC;

  const shareInvite = async () => {
    if (!eventId) return;
    const link = `rta://join?event=${eventId}`;
    try {
      await Share.share({ title: "Invite link", message: link });
    } catch {
      // no-op
    }
  };

  if (loading || !token) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Preparing QR…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{STR.showMyQR}</Text>

      <View style={styles.qrBox}>
        <QRCode value={token} size={240} />
      </View>

      <View style={{ width: "86%", height: 8, borderRadius: 999, backgroundColor: "#E5E7EB", overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%`, height: "100%", backgroundColor: "#2563eb" }} />
      </View>

      <Text style={styles.dim}>
        Auto-refresh every {PERIOD_SEC}s · Slot #{slot}
      </Text>

      <View style={{ height: 8 }} />

      <View style={{ flexDirection: "row", gap: 10, width: "86%" }}>
        <TouchableOpacity style={styles.primary} onPress={shareInvite}>
          <Text style={styles.primaryText}>{STR.shareInvite}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outline} onPress={() => {}}>
          <Text style={styles.outlineText}>{STR.showEventQR}</Text>
        </TouchableOpacity>
      </View>

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
  help: { color: "#374151", marginTop: 6, textAlign: "center" },

  primary: { flex: 1, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "700" },
  outline: { flex: 1, borderWidth: 2, borderColor: "#2563eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  outlineText: { color: "#2563eb", fontWeight: "700" },
});
