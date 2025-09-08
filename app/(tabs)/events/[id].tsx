import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";
import { haversineMeters } from "../../../lib/geo";

type EventRow = {
  id: string;
  title: string;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_radius_m: number | null;
};

const INTERVAL_MS = 20000;          // 15–30s
const DISTANCE_FILTER_M = 30;       // 25–50m
const ACCURACY_GATE_M = 75;         // 50–75m
const DWELL_GATE_MS = 10000;        // ≥10s
const RETRY_MS = 15000;             // network retry

export default function AttendeeEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = String(id);

  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [permGranted, setPermGranted] = useState(false);
  const [watching, setWatching] = useState(false);
  const [fix, setFix] = useState<Location.LocationObject | null>(null);
  const [lastInsideStartedAt, setLastInsideStartedAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // 👇 here: unifies type across web/native/node
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  // load event (center & radius)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,venue_lat,venue_lng,venue_radius_m")
        .eq("id", eventId)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        Alert.alert("Load failed", error.message);
        return;
      }
      setEventRow(data as any);
    })();
    return () => { mounted = false; };
  }, [eventId]);

  // permission + watchPosition
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;
      setPermGranted(granted);
      if (!granted) return;

      await Location.hasServicesEnabledAsync(); // optional check

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: INTERVAL_MS,
          distanceInterval: DISTANCE_FILTER_M,
          mayShowUserSettingsDialog: true,
        },
        (loc) => setFix(loc)
      );
      subRef.current = sub;
      setWatching(true);
    })();

    return () => {
      setWatching(false);
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const center = useMemo(() => {
    if (!eventRow?.venue_lat || !eventRow?.venue_lng) return null;
    return { lat: eventRow.venue_lat, lng: eventRow.venue_lng };
  }, [eventRow]);

  const radiusM = eventRow?.venue_radius_m ?? 100;

  const distanceM = useMemo(() => {
    if (!center || !fix) return null;
    return haversineMeters(center.lat, center.lng, fix.coords.latitude, fix.coords.longitude);
  }, [center, fix]);

  const accuracyM = fix?.coords?.accuracy ?? null;
  const insideRadius = distanceM != null ? distanceM <= radiusM : false;
  const goodAccuracy = accuracyM != null ? accuracyM <= ACCURACY_GATE_M : false;

  // dwell
  useEffect(() => {
    const now = Date.now();
    if (insideRadius && goodAccuracy) {
      if (lastInsideStartedAt == null) setLastInsideStartedAt(now);
    } else {
      setLastInsideStartedAt(null);
    }
  }, [insideRadius, goodAccuracy]);

  const dwellOk = lastInsideStartedAt != null ? Date.now() - lastInsideStartedAt >= DWELL_GATE_MS : false;
  const arrivedEnabled = permGranted && insideRadius && goodAccuracy && dwellOk && !sending;

  // send arrival (UPSERT gps)
  const sendArrival = async () => {
    if (!fix) return;
    setSending(true);
    const userId = await getGuestId();
    const { error } = await supabase
      .from("attendance")
      .upsert(
        {
          event_id: eventId,
          user_id: userId,
          checked_in_at_utc: new Date().toISOString(),
          method: "gps",
          accuracy_m: fix.coords.accuracy ?? null,
          comment: "gps v1",
        },
        { onConflict: "event_id,user_id,method" }
      );

    if (error) {
      // network retry
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(sendArrival, RETRY_MS);
    } else {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      Alert.alert("Arrived", "Your arrival has been recorded.");
    }
    setSending(false);
  };

  // Rescue UX
  const showRescueCTA = !permGranted || !goodAccuracy || !insideRadius;

  const openAppSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      if (Platform.OS === "ios") await Linking.openURL("app-settings:");
    }
  };

  const openMyQR = () => {
    router.push(`/organize/events/${eventId}/qr`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Event Check-in</Text>
      <Text style={styles.meta}>{eventRow?.title ?? "—"}{"\n"}Watching: {watching ? "ON" : "OFF"}</Text>

      <View style={styles.card}>
        <Row label="Distance" value={distanceM != null ? `${distanceM.toFixed(1)} m` : "—"} />
        <Row label="Accuracy" value={accuracyM != null ? `${Math.round(accuracyM)} m` : "—"} />
        <Row label="Inside radius" value={insideRadius ? "Yes" : "No"} />
        <Row label="Dwell" value={lastInsideStartedAt ? `${Math.floor((Date.now() - lastInsideStartedAt) / 1000)} s` : "0 s"} />
      </View>

      <TouchableOpacity
        disabled={!arrivedEnabled}
        onPress={sendArrival}
        style={[styles.arrivedBtn, !arrivedEnabled && styles.arrivedBtnDisabled]}
      >
        <Text style={styles.arrivedText}>{arrivedEnabled ? "Arrived! (GPS)" : "Waiting for gate…"}</Text>
      </TouchableOpacity>

      {showRescueCTA && (
        <View style={styles.cta}>
          <Text style={styles.ctaTitle}>Low precision or outside radius</Text>
          <Text style={styles.ctaSub}>Enable Precise Location in Settings, or use QR for instant check-in.</Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity onPress={openAppSettings} style={styles.ctaBtnPrimary}>
              <Text style={styles.ctaBtnText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openMyQR} style={styles.ctaBtnOutline}>
              <Text style={styles.ctaBtnOutlineText}>Show My QR</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tip}>
            <Text style={styles.tipText}>
              Tip: iOS → Settings → Privacy & Security → Location Services → this app → turn on “Precise Location”.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#0b0b0c" },
  h1: { fontSize: 22, fontWeight: "700", color: "#fff" },
  meta: { color: "#bfc3c9" },
  card: { backgroundColor: "#17181a", borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: "#232428" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#9aa1ac" },
  rowValue: { color: "#e8ebf0", fontWeight: "600" },
  arrivedBtn: { backgroundColor: "#2f8b57", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  arrivedBtnDisabled: { backgroundColor: "#2a2d31" },
  arrivedText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cta: { marginTop: 10, backgroundColor: "#1f2430", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334", gap: 10 },
  ctaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  ctaSub: { color: "#c9d1d9" },
  ctaRow: { flexDirection: "row", gap: 10 },
  ctaBtnPrimary: { flex: 1, backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  ctaBtnText: { color: "#fff", fontWeight: "700" },
  ctaBtnOutline: { flex: 1, borderWidth: 2, borderColor: "#3b82f6", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  ctaBtnOutlineText: { color: "#3b82f6", fontWeight: "700" },
  tip: { backgroundColor: "#111317", borderRadius: 10, padding: 10 },
  tipText: { color: "#96a0aa", fontSize: 12 },
});
