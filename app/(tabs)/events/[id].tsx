// app/(tabs)/events/[id].tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabase";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.01;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const CHECK_IN_RADIUS_METERS = 50;

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [MapView, setMapView] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Location, setLocation] = useState<any>(null);

  useEffect(() => {
    fetchEvent();

    if (Platform.OS !== "web") {
      // 動的 import
      (async () => {
        const maps = await import("react-native-maps");
        const location = await import("expo-location");
        setMapView(() => maps.default);
        setMarker(() => maps.Marker);
        setLocation(() => location);
      })();
    }
  }, []);

  useEffect(() => {
    if (event && userLocation) {
      const dist = getDistanceFromLatLonInMeters(
        event.latitude,
        event.longitude,
        userLocation.latitude,
        userLocation.longitude
      );
      setDistance(dist);
    }
  }, [event, userLocation]);

  useEffect(() => {
    if (Location) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          alert("Permission to access location was denied");
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location.coords);
      })();
    }
  }, [Location]);

  const fetchEvent = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();
    if (error) console.error(error);
    else setEvent(data);
    setLoading(false);
  };

  const getDistanceFromLatLonInMeters = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      0.5 -
      Math.cos(dLat) / 2 +
      (Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        (1 - Math.cos(dLon))) / 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  };

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Text>This page is not available on the web.</Text>
      </View>
    );
  }

  if (loading || !event || !userLocation || !MapView || !Marker) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.subtext}>
        📍 {event.location_name} | 🕒 {event.start_time}
      </Text>

      <MapView
        style={styles.map}
        region={{
          latitude: event.latitude,
          longitude: event.longitude,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        }}
        showsUserLocation
      >
        <Marker
          coordinate={{
            latitude: event.latitude,
            longitude: event.longitude,
          }}
          title="Event Location"
        />
      </MapView>

      <View style={styles.statusBox}>
        <Text style={styles.status}>
          You are {Math.round(distance!)} meters away.
        </Text>
        <Text
          style={[
            styles.attendance,
            {
              color: distance! <= CHECK_IN_RADIUS_METERS ? "green" : "gray",
            },
          ]}
        >
          {distance! <= CHECK_IN_RADIUS_METERS
            ? "✅ Attendance Possible"
            : "⏳ Too far to check-in"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  subtext: { fontSize: 14, color: "#666", marginBottom: 10 },
  map: { width: "100%", height: 300, borderRadius: 8 },
  statusBox: { marginTop: 20, alignItems: "center" },
  status: { fontSize: 16 },
  attendance: { fontSize: 18, fontWeight: "bold", marginTop: 8 },
});
