


// ここは RN。DOM 参照は厳禁。window 系は一切使わない。
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Share } from "react-native";
import { useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { getGuestId } from "../../../../../stores/session";
import { currentSlot, makeToken, PERIOD_SEC } from "../../../../../lib/qr";
import { STR } from "../../../../../lib/strings";

const SECRET = (process.env.EXPO_PUBLIC_QR_SECRET as string) || "DEV";

function resolveEventId(idParam?: string | string[] | null): string | null {
  const raw = Array.isArray(idParam) ? idParam[0] : idParam;
  const v = (raw ?? "").trim();
  if (!v || v === "undefined") return null;
  return v;
}

export default function Screen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = resolveEventId(params?.id ?? null);

  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [slot, setSlot] = useState<number>(currentSlot());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // デバッグ印
  // eslint-disable-next-line no-console
  console.log("[QR] mount params=", params, "eventId=", eventId);

  useEffect(() => {
    (async () => {
      try {
        const gid = await getGuestId();
        setUserId(gid);
      } catch (e: any) {
        setErr(e?.message ?? "failed to get guest id");
      }
    })();
  }, []);

  const rebuild = async (s: number) => {
    if (!eventId || !userId) return;
    try {
      const t = await makeToken(eventId, userId, SECRET, s);
      setToken(t);
    } catch (e: any) {
      setErr(e?.message ?? "failed to build token");
    }
  };

  useEffect(() => {
    setLoading(true);
    let mounted = true;

    const boot = async () => {
      try {
        const s = currentSlot();
        setSlot(s);
        await rebuild(s);
      } finally {
        if (mounted) setLoading(false);
      }
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
    } catch {}
  };

  // === 安全ガード群 ===
  if (err) {
    // eslint-disable-next-line no-console
    console.error("[QR] error:", err);
  }
  if (!eventId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No event id</Text>
        <Text style={styles.dim}>This screen requires /events/[id]</Text>
      </View>
    );
  }
  if (loading || !token) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Preparing QR…</Text>
        {err ? <Text style={{color:"#B00020"}}>{err}</Text> : null}
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
      <Text style={styles.dim}>Auto-refresh every {PERIOD_SEC}s · Slot #{slot}</Text>
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
  container:{ flex:1, backgroundColor:"#fff", alignItems:"center", justifyContent:"center", padding:16, gap:12 },
  center:{ flex:1, alignItems:"center", justifyContent:"center", gap:8 },
  title:{ fontSize:18, fontWeight:"800" },
  qrBox:{ padding:16, backgroundColor:"#F3F4F6", borderRadius:16 },
  dim:{ color:"#6B7280" },
  help:{ color:"#374151", marginTop:6, textAlign:"center" },
  primary:{ flex:1, backgroundColor:"#2563eb", borderRadius:12, paddingVertical:12, alignItems:"center" },
  primaryText:{ color:"#fff", fontWeight:"700" },
  outline:{ flex:1, borderWidth:2, borderColor:"#2563eb", borderRadius:12, paddingVertical:12, alignItems:"center" },
  outlineText:{ color:"#2563eb", fontWeight:"700" },
});




