import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Button, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

type Coords = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
};

export default function LocationTestScreen() {
  const [permission, setPermission] =
    useState<Location.PermissionStatus | null>(null);
  const [coords, setCoords] = useState<Coords>({
    latitude: null,
    longitude: null,
    accuracy: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);

  const watcher = useRef<Location.LocationSubscription | null>(null);

  const getCurrentPermission = async (): Promise<Location.PermissionStatus> => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setPermission(status);
    return status;
  };

  const requestPermission = async (): Promise<Location.PermissionStatus> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermission(status);
    return status;
  };

  const startWatch = async () => {
    try {
      setError(null);
      if (isWatching || watcher.current) return;

      let current = await getCurrentPermission();
      if (current !== Location.PermissionStatus.GRANTED) {
        current = await requestPermission();
        if (current !== Location.PermissionStatus.GRANTED) {
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
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 1,
        },
        (pos) => {
          // 停止直後の遅延コールバックを無視
          if (!isWatching && watcher.current === null) return;
          setCoords({
            latitude: pos.coords.latitude ?? null,
            longitude: pos.coords.longitude ?? null,
            accuracy: pos.coords.accuracy ?? null,
          });
        }
      );

      setIsWatching(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start location watcher.");
    }
  };

  const stopWatch = () => {
    try {
      setIsWatching(false);
      if (watcher.current) {
        watcher.current.remove();
        watcher.current = null;
      }
    } catch {
      // no-op
    }
  };

  // 初期：権限ステータスだけ取得
  useEffect(() => {
    (async () => {
      await getCurrentPermission();
    })();
    return () => {
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画面離脱で自動停止（復帰しても自動再開しない）
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopWatch();
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Test</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Permission:</Text>
        <Text style={styles.value}>{permission ?? "…"}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Latitude:</Text>
        <Text style={styles.mono}>
          {coords.latitude !== null ? coords.latitude.toFixed(6) : "—"}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Longitude:</Text>
        <Text style={styles.mono}>
          {coords.longitude !== null ? coords.longitude.toFixed(6) : "—"}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Accuracy (m):</Text>
        <Text style={styles.mono}>
          {coords.accuracy !== null ? Math.round(coords.accuracy) : "—"}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttons}>
        <Button title="Start" onPress={startWatch} disabled={isWatching} />
        <Button title="Stop" onPress={stopWatch} disabled={!isWatching} />
      </View>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Tip: Indoors accuracy may be poor. Try outdoors or press Start again.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  label: { width: 120, color: "#555" },
  value: { fontWeight: "600" },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 15,
  },
  error: { color: "#b00020", marginTop: 8 },
  buttons: { flexDirection: "row", gap: 12, marginTop: 8 },
  note: { backgroundColor: "#f2f8fb", padding: 12, borderRadius: 8, marginTop: 8 },
  noteText: { color: "#0a7ea4" },
});
