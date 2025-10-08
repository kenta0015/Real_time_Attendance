// app/(tabs)/organize/location-test.tsx
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Button, Platform, TextInput, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  ensureLocationPermissions,
  hasGeofencingStarted,
  startGeofencing,
  stopGeofencing,
} from "../../../lib/geofence";
import { noti, notiAvailable, ensureDefaultHandler, requestPerms } from "../../../lib/safeNoti";
import { flushOnce, getLength } from "../../../lib/syncQueue";
import { supabase } from "../../../lib/supabase";

type Coords = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
};

export default function LocationTestScreen() {
  const [permission, setPermission] = useState<Location.PermissionStatus | null>(null);
  const [bgPermission, setBgPermission] = useState<Location.PermissionStatus | null>(null);
  const [coords, setCoords] = useState<Coords>({ latitude: null, longitude: null, accuracy: null });
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const [radius, setRadius] = useState<string>("120");
  const [started, setStarted] = useState<boolean>(false);
  const [noteGranted, setNoteGranted] = useState<boolean>(false);
  const [qLen, setQLen] = useState<number>(0);

  useEffect(() => {
    if (notiAvailable) ensureDefaultHandler();
  }, []);

  async function refreshQueueLen() {
    setQLen(await getLength());
  }

  // Subscribe current position (lightweight watcher while focused)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const f = await Location.requestForegroundPermissionsAsync();
        setPermission(f.status);
        if (f.status !== "granted") return;

        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 3 },
          (pos) => {
            if (!active) return;
            setCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
            });
          }
        );
        watchRef.current = sub;
        await refreshQueueLen();
      })();

      return () => {
        active = false;
        watchRef.current?.remove();
        watchRef.current = null;
      };
    }, [])
  );

  useEffect(() => {
    (async () => {
      const h = await hasGeofencingStarted();
      setStarted(h);
      await refreshQueueLen();
    })();
  }, []);

  const onRequestAll = useCallback(async () => {
    if (notiAvailable) {
      const granted = await requestPerms();
      setNoteGranted(granted);
    } else {
      setNoteGranted(false);
    }
    const loc = await ensureLocationPermissions();
    setPermission(loc.status);
    if (loc.bg) setBgPermission(loc.bg);
  }, []);

  const onUseCurrentAndStart = useCallback(async () => {
    if (coords.latitude == null || coords.longitude == null) return;
    const r = Number(radius) || 120;
    await startGeofencing([
      {
        identifier: "location-test",
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius: r,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
    const h = await hasGeofencingStarted();
    setStarted(h);

    const N = await noti();
    if (!N) {
      Alert.alert("Notice", "Local notifications require a development build on Android (Expo Go not supported).");
      await refreshQueueLen();
      return;
    }
    await N.scheduleNotificationAsync({
      content: {
        title: "Geofence armed",
        body: `center=(${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}), r=${r}m`,
      },
      trigger: null,
    });
    await refreshQueueLen();
  }, [coords.latitude, coords.longitude, radius]);

  const onStop = useCallback(async () => {
    await stopGeofencing();
    const h = await hasGeofencingStarted();
    setStarted(h);

    const N = await noti();
    if (N) {
      await N.scheduleNotificationAsync({
        content: { title: "Geofence stopped", body: "Task stopped" },
        trigger: null,
      });
    }
    await refreshQueueLen();
  }, []);

  const sendTestNote = useCallback(async () => {
    const N = await noti();
    if (!N) {
      Alert.alert("Notice", "Local notifications require a development build on Android (Expo Go not supported).");
      return;
    }
    await N.scheduleNotificationAsync({
      content: { title: "Test notification", body: "This is a local test." },
      trigger: null,
    });
  }, []);

  // Manual flush using same RPC as background task
  const onFlush = useCallback(async () => {
    const res = await flushOnce(async (p) => {
      try {
        const rpc = await supabase.rpc("geofence_log", {
          p_event_id: p.event_id,
          p_dir: p.dir,
          p_at: p.at,
          p_region: p.region_id ?? null,
          p_acc: p.acc_m ?? null,
          p_device: p.device ?? null,
          p_idem: p.idem,
        });
        if (rpc.error) {
          const ins = await supabase.from("geofence_events").insert({
            event_id: p.event_id,
            dir: p.dir,
            at: p.at,
            region_id: p.region_id ?? null,
            acc_m: p.acc_m ?? null,
            device: p.device ?? null,
            idem: p.idem,
          });
          if (ins.error) return false;
        }
        return true;
      } catch {
        return false;
      }
    });
    await refreshQueueLen();
    Alert.alert("Flush", `ok=${res.ok}, ng=${res.ng}`);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location / Geofence Test</Text>

      <View style={styles.row}>
        <Text style={styles.label}>FG permission</Text>
        <Text style={styles.value}>{permission ?? "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>BG permission</Text>
        <Text style={styles.value}>{bgPermission ?? "—"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Notifications</Text>
        <Text style={styles.value}>{noteGranted ? "granted" : notiAvailable ? "unknown" : "unavailable (Expo Go)"}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Latitude</Text>
        <Text style={[styles.value, styles.mono]}>
          {coords.latitude != null ? coords.latitude.toFixed(6) : "—"}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Longitude</Text>
        <Text style={[styles.value, styles.mono]}>
          {coords.longitude != null ? coords.longitude.toFixed(6) : "—"}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Accuracy</Text>
        <Text style={styles.value}>
          {coords.accuracy != null ? `${Math.round(coords.accuracy)} m` : "—"}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Radius (m)</Text>
        <TextInput
          value={radius}
          onChangeText={setRadius}
          keyboardType="numeric"
          style={{ borderWidth: 1, borderColor: "#ccc", paddingHorizontal: 8, borderRadius: 6, minWidth: 100 }}
        />
      </View>

      <View style={styles.buttons}>
        <Button title="Request All Perms" onPress={onRequestAll} />
        <Button title="Test Notification" onPress={sendTestNote} />
      </View>

      <View style={styles.buttons}>
        <Button title="Start Geofence @ current" onPress={onUseCurrentAndStart} />
        <Button title="Stop Geofence" onPress={onStop} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Queue</Text>
        <Text style={styles.value}>{qLen}</Text>
        <View style={{ marginLeft: 12 }}>
          <Button title="Flush Queue Now" onPress={onFlush} />
        </View>
      </View>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          • Background ENTER/EXIT requires Dev Client + platform settings (iOS: UIBackgroundModes["location"], Android: ACCESS_BACKGROUND_LOCATION).
        </Text>
        <Text style={styles.noteText}>
          • On Android Expo Go, notifications are unavailable. Use a development build for local notifications.
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Started?</Text>
        <Text style={styles.value}>{started ? "Yes" : "No"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  label: { width: 140, color: "#555" },
  value: { fontWeight: "600" },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 15,
  },
  buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
  note: { backgroundColor: "#f2f8fb", padding: 12, borderRadius: 8, marginTop: 8 },
  noteText: { color: "#0a7ea4" },
});
