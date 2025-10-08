// app/(tabs)/organize/events/[id].tsx
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
import { useLocalSearchParams, router } from "expo-router";
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
  const WATCH_TIME_MS = 15000; // 15s
  const WATCH_DIST_M = 25; // 25m
  const DWELL_MS = 10000; // 10s
  const RETRY_MS = 15000; // network retry delay
  const HEARTBEAT_MS = 30000; // 30s: update last_valid_seen_utc while in-range

  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [coords, setCoords] = useState<Coords>({ lat: null, lng: null, acc: null });
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);

  const [preciseAllowed, setPreciseAllowed] = useState<boolean>(true);
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [reqElapsedMs, setReqElapsedMs] = useState<number | null>(null);
  const [lastMocked, setLastMocked] = useState<boolean | null>(null);

  const [dwellStartAt, setDwellStartAt] = useState<number | null>(null);
  const [dwellElapsedMs, setDwellElapsedMs] = useState<number>(0);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // refs for heartbeat without stale closure
  const eventRef = useRef<EventRow | null>(null);
  const guestRef = useRef<string | null>(null);
  const lastBeatAtRef = useRef<number>(0);

  const showError = (msg: string) =>
    Platform.OS === "android" ? ToastAndroid.show(msg, ToastAndroid.SHORT) : Alert.alert("Error", msg);
  const showSuccess = (msg: string) =>
    Platform.OS === "android" ? ToastAndroid.show(msg, ToastAndroid.SHORT) : Alert.alert("Success", msg);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_utc,end_utc,lat,lng,radius_m,window_minutes,location_name")
        .eq("id", id)
        .single();
      if (error) setError(error.message);
      else setEvent(data as EventRow);
      const g = await getGuestId();
      setGuestId(g);
    })();
  }, [id]);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  useEffect(() => {
    guestRef.current = guestId;
  }, [guestId]);

  useEffect(() => {
    return () => {
      try {
        watcher.current?.remove();
      } catch {}
      watcher.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const getCurrentPermission = async () => (await Location.getForegroundPermissionsAsync()).status;
  const requestPermission = async () => (await Location.requestForegroundPermissionsAsync()).status;

  const heartbeatIfEligible = async (lat: number | null, lng: number | null, acc: number | null) => {
    const e = eventRef.current;
    const uid = guestRef.current;
    if (!e || !uid || lat == null || lng == null) return;
    const now = Date.now();
    if (now - lastBeatAtRef.current < HEARTBEAT_MS) return;

    const withinWindow = isWithinWindow(now, e.start_utc, e.end_utc, e.window_minutes);
    const dist = haversineMeters(lat, lng, e.lat, e.lng);
    const withinRadius = dist <= e.radius_m;
    const accGate = Platform.OS === "web" ? true : acc != null && acc <= accuracyThreshold(e.radius_m ?? 50);

    if (withinWindow && withinRadius && accGate) {
      lastBeatAtRef.current = now;
      try {
        await supabase
          .from("attendance")
          .update({ last_valid_seen_utc: new Date().toISOString() })
          .eq("event_id", e.id)
          .eq("user_id", uid);
      } catch {}
    }
  };

  const startWatch = async () => {
    try {
      setError(null);
      if (Platform.OS !== "web") {
        const status = await getCurrentPermission();
        if (status !== "granted" && (await requestPermission()) !== "granted") {
          setError("Location permission is required.");
          return;
        }
      }
      await checkPrecise();
      if (Platform.OS === "android" && !(await Location.hasServicesEnabledAsync())) {
        setError("Please enable device location (GPS) and try again.");
        return;
      }
      const __t0 = Date.now();
      watcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: WATCH_TIME_MS,
          distanceInterval: WATCH_DIST_M,
          mayShowUserSettingsDialog: true,
        },
        (pos) => {
          setReqElapsedMs(Date.now() - __t0);
          setLastMocked((pos as any)?.mocked ?? null);
          const c = {
            lat: pos.coords.latitude ?? null,
            lng: pos.coords.longitude ?? null,
            acc: pos.coords.accuracy ?? null,
          };
          setCoords(c);
          // heartbeat while in-range
          heartbeatIfEligible(c.lat, c.lng, c.acc);
        }
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to start watcher.");
    }
  };

  const stopWatch = () => {
    try {
      watcher.current?.remove();
      watcher.current = null;
    } catch {}
  };

  useEffect(() => {
    startWatch();
    return () => stopWatch();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        if (level != null) setBatteryPct(Math.round(level * 100));
      } catch {}
    })();
  }, []);

  const checkPrecise = async () => {
    if (Platform.OS !== "android") return;
    try {
      const p = await Location.getForegroundPermissionsAsync();
      // @ts-ignore
      setPreciseAllowed(!!(p?.android?.isPrecise ?? true));
    } catch {}
  };

  const computeEligible = (c: Coords) => {
    if (!event || c.lat == null || c.lng == null) return false;
    const withinWindow = isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes);
    if (!withinWindow) return false;
    const dist = haversineMeters(c.lat, c.lng, event.lat, event.lng);
    const withinRadius = dist <= event.radius_m;
    const accGate = Platform.OS === "web" ? true : c.acc != null && c.acc <= accuracyThreshold(event.radius_m ?? 50);
    return withinWindow && withinRadius && accGate;
  };

  useEffect(() => {
    const eligibleNow = computeEligible(coords);
    if (eligibleNow) {
      if (dwellStartAt == null) setDwellStartAt(Date.now());
    } else {
      setDwellStartAt(null);
      setDwellElapsedMs(0);
    }
    let t: any = null;
    if (eligibleNow) {
      t = setInterval(() => {
        setDwellElapsedMs(() => {
          if (dwellStartAt == null) return 0;
          return Date.now() - dwellStartAt;
        });
      }, 500);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [coords, event, dwellStartAt]);

  const eligible = useMemo(() => computeEligible(coords), [coords, event]);

  const distanceM = useMemo(() => {
    if (!event || coords.lat == null || coords.lng == null) return null;
    return haversineMeters(coords.lat, coords.lng, event.lat, event.lng);
  }, [coords, event]);

  const acquireHighAcc = async (): Promise<Coords | null> => {
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
    } catch {
      return null;
    }
  };

  const manualRefresh = async () => {
    const c = await acquireHighAcc();
    if (!c) {
      showError("Failed to acquire high accuracy fix.");
      return;
    }
    const dist = c && event && c.lat != null && c.lng != null ? haversineMeters(c.lat, c.lng, event.lat, event.lng) : null;
    if (dist != null) {
      if (dist <= (event?.radius_m ?? 0)) showSuccess("High-accuracy fix acquired (inside radius).");
      else showError(`High-accuracy fix acquired, still out of radius (~${Math.round(dist)} m).`);
    }
  };

  // --- submit with 15s retry on network issues ---
  const isNetworkError = (e: any) => {
    const msg = String(e?.message || "").toLowerCase();
    return /fetch|network|timeout|timed out|socket|offline/.test(msg);
  };

  const submitAttendance = async (
    row: {
      event_id: string;
      user_id: string;
      checked_in_at_utc: string;
      lat: number | null;
      lng: number | null;
      accuracy_m: number | null;
      comment: string | null;
      method: string | null;
      last_valid_seen_utc: string | null;
    },
    isRetry = false
  ) => {
    try {
      const { error } = await supabase.from("attendance").upsert(row);
      if (error) throw error;
      showSuccess(isRetry ? "Arrived (retried)!" : "Arrived!");
      setComment("");
      setDwellStartAt(null);
      setDwellElapsedMs(0);
      // initial heartbeat baseline
      lastBeatAtRef.current = Date.now();
    } catch (e: any) {
      if (!isRetry && isNetworkError(e)) {
        showError("Network issue. Retrying in 15s…");
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          submitAttendance(row, true);
        }, RETRY_MS);
      } else {
        showError(e?.message ?? "Failed to check in.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const tryCheckIn = async () => {
    if (!computeEligible(coords)) {
      showError("Not eligible yet (distance/accuracy/time window).");
      return;
    }
    if (dwellElapsedMs < DWELL_MS) {
      const remain = Math.ceil((DWELL_MS - dwellElapsedMs) / 1000);
      showError(`Stay put for ${remain}s more to confirm arrival.`);
      return;
    }
    try {
      if (!event) return;
      if (!guestId) {
        showError("No device id (guest).");
        return;
      }
      if (Platform.OS !== "web") {
        try {
          const high = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            mayShowUserSettingsDialog: true,
          });
          setCoords({
            lat: high.coords.latitude ?? null,
            lng: high.coords.longitude ?? null,
            acc: high.coords.accuracy ?? null,
          });
        } catch {}
      }
      let current = coords;
      if (!computeEligible(current)) {
        const newer = await acquireHighAcc();
        if (newer) current = newer;
        if (!computeEligible(current)) {
          const dist =
            current.lat != null && current.lng != null && event
              ? haversineMeters(current.lat, current.lng, event.lat, event.lng)
              : null;
          const thr = accuracyThreshold(event.radius_m ?? 50);
          if (!isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes)) {
            showError("Outside event time window.");
          } else if (dist != null && event && dist > event.radius_m) {
            showError(`Out of radius (${Math.round(dist)} m > ${event.radius_m} m). Try moving outdoors.`);
          } else if (current.acc != null && current.acc > thr) {
            showError(`Low accuracy (±${Math.round(current.acc)} m > ±${thr} m). Try QR fallback or move outside.`);
          } else {
            showError("Not eligible to check in yet.");
          }
          return;
        }
      }
      if (!preciseAllowed) {
        showError("Precise location is OFF. Please enable it in Settings.");
        return;
      }
      setSubmitting(true);
      const nowIso = new Date().toISOString();
      const row = {
        event_id: event.id,
        user_id: guestId!,
        checked_in_at_utc: nowIso,
        lat: current.lat,
        lng: current.lng,
        accuracy_m: current.acc,
        comment: comment || null,
        method: "gps",
        last_valid_seen_utc: nowIso,
      };
      await submitAttendance(row, false);
    } catch (e: any) {
      showError(e?.message ?? "Failed to check in.");
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
        <Text style={styles.title}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{event.title ?? "Event"}</Text>

      {error ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>{error}</Text>
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}

      {__DEV__ ? (
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>
            acc(m): {coords.acc ?? "—"} | req(ms): {reqElapsedMs ?? "—"} | battery(%): {batteryPct ?? "—"} | precise:{" "}
            {String(preciseAllowed)} | mocked: {String(lastMocked)}
          </Text>
          <View style={{ marginTop: 8 }}>
            <Button title="Refresh GPS (High acc)" onPress={manualRefresh} />
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.section}>Your position</Text>
        <Text style={styles.kv}>
          Lat/Lng: {coords.lat ?? "—"} , {coords.lng ?? "—"}
        </Text>
        <Text style={styles.kv}>
          Distance: {distanceM == null ? "—" : `${distanceM} m`} | Accuracy:{" "}
          {coords.acc == null ? "—" : `±${Math.round(coords.acc)} m`}
        </Text>
        <Text style={styles.kv}>
          Window: {isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes) ? "OK" : "Closed"}
        </Text>
        <Text style={styles.kv}>
          Dwell:{" "}
          {eligible
            ? `${Math.min(Math.floor(dwellElapsedMs / 1000), Math.floor(DWELL_MS / 1000))} / ${Math.floor(
                DWELL_MS / 1000
              )} s`
            : "—"}
        </Text>
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
        <TextInput value={comment} onChangeText={setComment} placeholder='e.g. "Here now"' maxLength={150} style={styles.input} />
      </View>

      <AttendeeOnly>
        <Button
          title={
            submitting
              ? "Checking in…"
              : eligible
              ? dwellElapsedMs >= DWELL_MS
                ? "Arrive"
                : `Arrive in ${Math.ceil((DWELL_MS - dwellElapsedMs) / 1000)}s`
              : "Check in"
          }
          onPress={tryCheckIn}
          disabled={!preciseAllowed || submitting || !eligible || dwellElapsedMs < DWELL_MS}
        />
        <View style={{ height: 8 }} />
        <Button title="Show my QR" onPress={() => router.push(`/organize/events/${id}/qr`)} />
      </AttendeeOnly>

      <View style={{ height: 8 }} />
      <Button title="Scan QR (Organizer)" onPress={() => router.push(`/organize/events/${id}/scan`)} />

      <View style={styles.block}>
        <Text style={styles.section}>Venue</Text>
        <Text style={styles.kv}>
          {event.location_name ? `${event.location_name} • ` : null}
          {event.lat}, {event.lng} • radius {event.radius_m} m
        </Text>
        <View style={{ marginTop: 6 }}>
          <Button
            title="Open in Google Maps"
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${event.lat},${event.lng}`)}
          />
        </View>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },

  section: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  block: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  kv: { color: "#444", marginTop: 2 },

  badge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    color: "white",
  },
  ok: { backgroundColor: "#10B981" },
  ng: { backgroundColor: "#6B7280" },

  input: { borderWidth: 1, borderColor: "#ddd", padding: 10, borderRadius: 8, marginTop: 6 },

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

  reason: { color: "#6B7280", marginTop: 6 },
});
