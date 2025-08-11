import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { useUser } from "@supabase/auth-helpers-react";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.01;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const CHECK_IN_RADIUS_METERS = 50;

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const user = useUser();

  const [event, setEvent] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);

  const [MapView, setMapView] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Location, setLocation] = useState<any>(null);

  useEffect(() => {
    fetchEvent();

    if (Platform.OS !== "web") {
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
    if (event && user) {
      fetchGroupMembers(event.group_id);
    }
  }, [event, user]);

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
        console.log("✅ [userLocation]", location.coords);
        setUserLocation(location.coords);
      })();
    }
  }, [Location]);

  useEffect(() => {
    console.log("✅ [user?.id]:", user?.id);
    console.log("✅ [event]:", event);
    console.log("✅ [groupMembers]:", groupMembers);
  }, [user, event, groupMembers]);

  const fetchEvent = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    console.log("✅ [fetchEvent] id:", id);
    console.log("✅ [fetchEvent] event:", data);

    if (error) console.error("❌ [fetchEvent] error:", error);
    else setEvent(data);

    setLoading(false);
  };

  const fetchGroupMembers = async (groupId: string) => {
    const { data, error } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId);

    if (error) {
      console.error("❌ [fetchGroupMembers] error:", error);
      return;
    }

    setGroupMembers(data);
    const currentMember = data.find((m: any) => m.user_id === user?.id);
    setIsOrganizer(currentMember?.is_organizer ?? false);
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

      {isOrganizer ? (
        <View style={styles.statusBox}>
          <Text style={styles.status}>👑 Organizer View</Text>
        </View>
      ) : (
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
      )}
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
