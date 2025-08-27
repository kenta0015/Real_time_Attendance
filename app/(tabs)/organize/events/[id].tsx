import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Button, TextInput, Alert, Platform, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../../../../lib/supabase";
import { getGuestId } from "../../../../stores/session";
import { haversineMeters, isWithinWindow, accuracyThreshold } from "../../../../lib/geo";

type EventRow = {
  id: string;
  title: string;
  start_utc: string;
  end_utc: string;
  lat: number;
  lng: number;
  radius_m: number;
  window_minutes: number;
  location_name: string | null;
};

export default function EventDetail() {
  const params = useLocalSearchParams();
  const id = typeof params.id === "string" ? params.id : undefined;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [guestId, setGuestId] = useState("");
  const [permission, setPermission] = useState<Location.PermissionStatus | null>(null);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null; acc: number | null }>({
    lat: null, lng: null, acc: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [isWatching, setIsWatching] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    (async () => {
      const gid = await getGuestId(); setGuestId(gid);

      if (!id) { setError("Invalid event id."); return; }

      const { data, error } = await supabase
        .from("events")
        .select("id,title,start_utc,end_utc,lat,lng,radius_m,window_minutes,location_name")
        .eq("id", id)
        .single();

      if (error) setError(error.message);
      else setEvent(data as EventRow);

      const p = await Location.getForegroundPermissionsAsync();
      setPermission(p.status);
    })();

    return () => { stopWatch(); };
  }, [id]);

  const startWatch = async () => {
    try {
      setError(null);
      if (isWatching || watcher.current) return;

      let status = (await Location.getForegroundPermissionsAsync()).status;
      setPermission(status);
      if (status !== Location.PermissionStatus.GRANTED) {
        status = (await Location.requestForegroundPermissionsAsync()).status;
        setPermission(status);
        if (status !== Location.PermissionStatus.GRANTED) {
          setError("Location permission not granted.");
          return;
        }
      }

      if (Platform.OS === "android") {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          setError("Please enable device location (GPS) and try again.");
          return;
        }
      }

      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 1 },
        (pos) => {
          if (!isWatching && watcher.current === null) return;
          setCoords({
            lat: pos.coords.latitude ?? null,
            lng: pos.coords.longitude ?? null,
            acc: pos.coords.accuracy ?? null,
          });
        }
      );
      setIsWatching(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start GPS.");
    }
  };

  const stopWatch = () => {
    try {
      setIsWatching(false);
      if (watcher.current) {
        watcher.current.remove();
        watcher.current = null;
      }
    } catch {}
  };

  const distanceM = useMemo(() => {
    if (!event || coords.lat == null || coords.lng == null) return null;
    return haversineMeters(coords.lat, coords.lng, event.lat, event.lng);
  }, [coords, event]);

  const eligible = useMemo(() => {
    if (!event) return false;
    const withinWindow = isWithinWindow(Date.now(), event.start_utc, event.end_utc, event.window_minutes);
    const withinRadius = distanceM != null && distanceM <= event.radius_m;
    const accOk = coords.acc != null && coords.acc <= accuracyThreshold(event.radius_m);
    return !!(withinWindow && withinRadius && accOk);
  }, [event, distanceM, coords]);

  const accLimit = event ? accuracyThreshold(event.radius_m) : 50;

  const tryCheckIn = async () => {
    if (!event) return;
    if (!eligible) {
      Alert.alert("Not eligible", "Within time/radius/accuracy to check in.");
      return;
    }
    const { error } = await supabase.from("attendance").upsert({
      event_id: event.id,
      user_id: guestId,
      checked_in_at_utc: new Date().toISOString(),
      lat: coords.lat,
      lng: coords.lng,
      accuracy_m: coords.acc,
      comment: comment.trim() ? comment.trim() : null,
    });
    if (error) { Alert.alert("Error", error.message); return; }
    Alert.alert("Success", "Checked in.");
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
        Venue: {event.location_name ?? "(no name)"} (lat {event.lat}, lng {event.lng})
      </Text>
      <Text style={styles.caption}>
        Radius {event.radius_m} m · Window ±{event.window_minutes} min
      </Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Your location</Text>
        <Text>Permission: {permission ?? "…"}</Text>
        <Text>Lat: {coords.lat != null ? coords.lat.toFixed(6) : "—"}</Text>
        <Text>Lng: {coords.lng != null ? coords.lng.toFixed(6) : "—"}</Text>
        <Text>Accuracy: {coords.acc != null ? Math.round(coords.acc) : "—"} m (≤ {accLimit} m)</Text>
        <Text>Distance: {distanceM != null ? `${distanceM} m` : "—"}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <Button title="Start GPS" onPress={startWatch} disabled={isWatching} />
          <Button title="Stop GPS" onPress={stopWatch} disabled={!isWatching} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Eligibility</Text>
        <Text>{eligible ? "✅ Eligible to check in" : "⛔ Not eligible"}</Text>
        <Text style={styles.small}>Must be inside radius, within time window, and accuracy ≤ limit.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Comment (optional, ≤150)</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <Button title="Here now" onPress={() => setComment("Here now")} />
          <Button title="Arriving in 5 min" onPress={() => setComment("Arriving in 5 min")} />
          <Button title="Running late" onPress={() => setComment("Running late")} />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Write a short note…"
          value={comment}
          onChangeText={(t) => setComment(t.slice(0, 150))}
        />
        <Button title="Check in" onPress={tryCheckIn} disabled={!eligible} />
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700" },
  caption: { color: "#666" },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  small: { color: "#666", fontSize: 12 },
  card: { backgroundColor: "#fafafa", borderColor: "#e5e5e5", borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" },
  error: { color: "#b00020" },
});
