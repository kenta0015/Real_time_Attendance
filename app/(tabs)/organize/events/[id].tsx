import { AttendeeOnly } from "../../../../components/roleGates";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Button,
  TextInput,
  Alert,
  Platform,
  ScrollView,
  ToastAndroid,
  Keyboard,
  Linking,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import { supabase } from "../../../../lib/supabase";
import { getGuestId } from "../../../../stores/session";
import { haversineMeters, isWithinWindow, accuracyThreshold } from "../../../../lib/geo";

type EventRow = {
  id: string;
  title: string | null;
  start_utc: string;
  end_utc: string;
  lat: number;
  lng: number;
  radius_m: number;
  window_minutes: number;
  location_name: string | null;
};

type Coords = { lat: number | null; lng: number | null; acc: number | null };

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords>({ lat: null, lng: null, acc: null });
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);

  const [preciseAllowed, setPreciseAllowed] = useState<boolean>(true);
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [reqElapsedMs, setReqElapsedMs] = useState<number | null>(null);
  const [lastMocked, setLastMocked] = useState<boolean | null>(null);

  const showError = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("Error", msg);
  };
  const showSuccess = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("Success", msg);
  };

  const loadEvent = async () => {
    if (!id) return;
    setError(null);
    const { data, error } = await supabase
      .from("events")
      .select("id, title, start_utc, end_utc, lat, lng, radius_m, window_minutes, location_name")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (data) setEvent(data as unknown as EventRow);
  };

  const readGuest = async () => {
    const gid = await getGuestId();
    setGuestId(gid);
  };

  const checkPrecise = async () => {
    try {
      if (Platform.OS === "ios" && (Location as any).getAccuracyAuthorizationAsync) {
        // iOS 14+: Full / Reduced
        // @ts-ignore
        const acc = await Location.getAccuracyAuthorizationAsync();
        const ok =
          acc === (Location as any).AccuracyAuthorization?.FullAccuracy || acc === "full";
        setPreciseAllowed(!!ok);
        return !!ok;
      }
      // Android or API not available -> treat as precise OK
      setPreciseAllowed(true);
      return true;
    } catch {
      setPreciseAllowed(true);
      return true;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if ((Battery as any).getBatteryLevelAsync) {
          const lvl = await Battery.getBatteryLevelAsync();
          setBatteryPct(Math.round(((lvl ?? 0) as number) * 100));
        }
      } catch {}
      await checkPrecise();
    })();
  }, []);

  useEffect(() => {
    loadEvent();
    readGuest();
  }, [id]);

  const getCurrentPermission = async () => {
    const p = await Location.getForegroundPermissionsAsync();
    return p.status;
  };
  const requestPermission = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    return p.status;
  };

  const startWatch = async () => {
    try {
      if (watcher.current) return;

      Keyboard.dismiss();

      let current = await getCurrentPermission();
      if (current !== Location.PermissionStatus.GRANTED) {
        current = await requestPermission();
        if (current !== Location.PermissionStatus.GRANTED) {
          setError("Location permission not granted.");
          return;
        }
      }

      await checkPrecise();

      if (Platform.OS === "android") {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          setError("Please enable device location (GPS) and try again.");
          return;
        }
      }

      const __t0 = Date.now();
      watcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced, // battery-friendly; we do a one-shot High before check-in
          timeInterval: 5000,
          mayShowUserSettingsDialog: true,
        },
        (pos) => {
          setReqElapsedMs(Date.now() - __t0);
          setLastMocked((pos as any)?.mocked ?? null);
          setCoords({
            lat: pos.coords.latitude ?? null,
            lng: pos.coords.longitude ?? null,
            acc: pos.coords.accuracy ?? null,
          });
        }
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to start watcher.");
    }
  };

  const stopWatch = () => {
    try {
      if (watcher.current) {
        watcher.current.remove();
        watcher.current = null;
      }
    } catch {}
  };

  useEffect(() => {
    startWatch();
    return () => stopWatch();
  }, []);

  // shared eligibility check
  const computeEligible = (c: Coords) => {
    if (!event || c.lat == null || c.lng == null) return false;
    const withinWindow = isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes);
    if (!withinWindow) return false;
    const dist = haversineMeters(c.lat, c.lng, event.lat, event.lng);
    const withinRadius = dist <= event.radius_m;
    const accGate =
      Platform.OS === "web" ? true : c.acc != null && c.acc <= accuracyThreshold(event.radius_m ?? 50);
    return withinWindow && withinRadius && accGate;
  };

  const eligible = useMemo(() => computeEligible(coords), [coords, event]);

  const distanceM = useMemo(() => {
    if (!event || coords.lat == null || coords.lng == null) return null;
    return haversineMeters(coords.lat, coords.lng, event.lat, event.lng);
  }, [coords, event]);

  // One-shot high-accuracy fix
  const acquireHighAcc = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const fresh: Coords = {
        lat: pos.coords.latitude ?? null,
        lng: pos.coords.longitude ?? null,
        acc: pos.coords.accuracy ?? null,
      };
      setCoords(fresh);
      return fresh;
    } catch (e: any) {
      showError(e?.message ?? "Failed to get high-accuracy fix.");
      return null;
    }
  };

  const manualRefresh = async () => {
    const c = await acquireHighAcc();
    if (!c) return;
    const dist =
      c.lat != null && c.lng != null && event ? haversineMeters(c.lat, c.lng, event.lat, event.lng) : null;
    if (dist != null) {
      if (dist <= (event?.radius_m ?? 0)) showSuccess("High-accuracy fix acquired (inside radius).");
      else showError(`High-accuracy fix acquired, still out of radius (~${Math.round(dist)} m).`);
    }
  };

  const tryCheckIn = async () => {
    try {
      if (!guestId || !event) return;

      // If not eligible, try a high-accuracy one-shot and re-check
      let current = coords;
      if (!computeEligible(current)) {
        const fresh = await acquireHighAcc();
        if (!fresh) return;
        current = fresh;
        if (!computeEligible(current)) {
          const dist =
            current.lat != null && current.lng != null
              ? haversineMeters(current.lat, current.lng, event.lat, event.lng)
              : null;
          const thr = accuracyThreshold(event.radius_m ?? 50);
          if (!isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes)) {
            showError("Outside event time window.");
          } else if (dist != null && dist > event.radius_m) {
            showError(`Out of radius (${Math.round(dist)} m > ${event.radius_m} m). Try moving outdoors.`);
          } else if (current.acc != null && current.acc > thr) {
            showError(`Low accuracy (±${Math.round(current.acc)} m > ${thr} m). Try sky view / wait a moment.`);
          } else if (!preciseAllowed) {
            showError("Precise Location is OFF. Please enable it in Settings.");
          } else {
            showError("Not eligible to check in yet.");
          }
          return;
        }
      }

      if (!preciseAllowed) {
        showError("Precise Location is OFF. Please enable it in Settings.");
        return;
      }

      setSubmitting(true);
      const { error } = await supabase.from("attendance").upsert({
        event_id: event.id,
        user_id: guestId,
        checked_in_at_utc: new Date().toISOString(),
        lat: current.lat,
        lng: current.lng,
        accuracy_m: current.acc,
        comment: comment.trim() ? comment.trim() : (lastMocked ? "[mocked]" : null),
      });
      if (error) throw error;

      setComment("");
      showSuccess("Checked in!");
    } catch (e: any) {
      showError(e?.message ?? "Failed to check in.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Invalid event id.</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading event…</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.caption}>
        {new Date(event.start_utc).toLocaleString()} — {new Date(event.end_utc).toLocaleString()}
      </Text>
      <Text style={styles.caption}>
        Venue: {event.location_name || "—"} / Radius: {event.radius_m} m / Window: ±
        {event.window_minutes} min
      </Text>

      {!preciseAllowed ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>Precise Location is OFF. Enable it to check in.</Text>
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}

      {__DEV__ ? (
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>
            acc(m): {coords.acc ?? "—"} | req(ms): {reqElapsedMs ?? "—"} | battery(%):{" "}
            {batteryPct ?? "—"} | mocked: {String(lastMocked)}
          </Text>
          <View style={{ marginTop: 6 }}>
            <Button title="Refresh GPS (High acc)" onPress={manualRefresh} />
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.section}>Your position</Text>
        <Text style={styles.kv}>
          Lat/Lng: {coords.lat ?? "—"} , {coords.lng ?? "—"} (±{coords.acc ?? "—"} m)
        </Text>
        <Text style={styles.kv}>Distance to venue: {distanceM == null ? "—" : `${distanceM} m`}</Text>
        <Text style={[styles.badge, eligible ? styles.ok : styles.ng]}>
          {eligible ? "In-range" : "Not ready"}
        </Text>
        {!eligible ? (
          <Text style={styles.reason}>
            {(() => {
              if (!isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes))
                return "Outside event time window";
              const dist = distanceM == null ? null : distanceM;
              if (dist != null && event && dist > event.radius_m)
                return `Out of radius (${Math.round(dist)}m > ${event.radius_m}m)`;
              if (Platform.OS !== "web" && coords.acc != null && event) {
                const thr = accuracyThreshold(event.radius_m ?? 50);
                if (coords.acc > thr) return `Low accuracy (±${Math.round(coords.acc)}m > ${thr}m)`;
              }
              if (!preciseAllowed) return "Precise location is OFF";
              return "Not eligible yet";
            })()}
          </Text>
        ) : null}
      </View>

      <View style={styles.block}>
        <Text style={styles.section}>Comment (optional)</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder='e.g. "Here now"'
          maxLength={150}
          style={styles.input}
        />
      </View>

      <AttendeeOnly>
        <Button
          title={submitting ? "Checking in…" : "Check in"}
          onPress={tryCheckIn}
          disabled={!preciseAllowed || submitting}
        />
      </AttendeeOnly>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertBox: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
  },
  alertText: { color: "#9A3412", fontWeight: "600" },
  debugBox: { backgroundColor: "#111827", padding: 8, borderRadius: 8, marginTop: 8 },
  debugText: { color: "white", fontSize: 12 },

  container: { flexGrow: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "800" },
  caption: { color: "#555" },
  block: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  section: { fontWeight: "800", fontSize: 16 },
  kv: { color: "#333" },
  reason: { marginTop: 6, color: "#6B7280" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    fontWeight: "800",
    overflow: "hidden",
    color: "#fff",
  },
  ok: { backgroundColor: "#059669" },
  ng: { backgroundColor: "#DC2626" },
  input: {
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: "#B91C1C" },
  flash: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    opacity: 0.92,
  },
  flashText: { color: "#fff", fontWeight: "800" },
});
