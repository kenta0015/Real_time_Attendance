// app/(tabs)/organize/active-event.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { supabase } from "../../../lib/supabase";

interface ActiveUser {
  id: number;
  user_name: string;
  status: string;
  timestamp: string;
}

export default function ActiveEventScreen() {
  const [attendees, setAttendees] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTitle, setEventTitle] = useState("Current Event");
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(fetchLiveAttendees, 5000);
    fetchLiveAttendees();
    return () => clearInterval(interval);
  }, []);

  const fetchLiveAttendees = async () => {
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error fetching active users:", error);
    } else {
      const uniqueMap = new Map();
      data.forEach((entry) => {
        if (!uniqueMap.has(entry.user_name)) {
          uniqueMap.set(entry.user_name, entry);
        }
      });
      const uniqueAttendees = Array.from(uniqueMap.values());
      setAttendees(uniqueAttendees);
      setLiveCount(uniqueAttendees.filter((a) => a.status === "present").length);
    }

    setLoading(false);
  };

  const renderItem = ({ item }: { item: ActiveUser }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.user_name}</Text>
      <Text style={styles.status}>Status: {item.status}</Text>
      <Text style={styles.timestamp}>
        🕒 {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{eventTitle}</Text>
      <Text style={styles.subtitle}>
        Live Attendees: {liveCount} / {attendees.length}
      </Text>

      <FlatList
        data={attendees}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#444", marginBottom: 16 },
  card: {
    padding: 14,
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: "bold" },
  status: { fontSize: 14, marginTop: 2 },
  timestamp: { fontSize: 12, color: "#888", marginTop: 4 },
});
