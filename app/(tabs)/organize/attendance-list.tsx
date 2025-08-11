// app/(tabs)/organize/attendance-list.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../../../lib/supabase"; // adjust path if needed

interface AttendanceLog {
  id: number;
  user_name: string;
  event_id: string;
  status: string;
  comment?: string;
  timestamp: string;
}

export default function AttendanceListScreen() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendanceLogs();
  }, []);

  const fetchAttendanceLogs = async () => {
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("*")
      .order("timestamp", { ascending: false });

    console.log("📦 attendance_logs data:", data);
    console.log("⚠️ attendance_logs error:", error);

    if (error) {
      console.error("Error fetching attendance logs:", error);
    } else {
      setLogs(data as AttendanceLog[]);
    }

    setLoading(false);
  };

  const renderItem = ({ item }: { item: AttendanceLog }) => (
    <View style={styles.item}>
      <Text style={styles.name}>
        {item.user_name} - {item.status}
      </Text>
      {item.comment && <Text style={styles.comment}>💬 {item.comment}</Text>}
      <Text style={styles.timestamp}>
        🕒 {new Date(item.timestamp).toLocaleString()}
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
      <Text style={styles.header}>Attendance Log</Text>
      {logs.length === 0 ? (
        <Text style={styles.emptyText}>No attendance logs found.</Text>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  item: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: "bold" },
  comment: { fontSize: 14, fontStyle: "italic", marginTop: 4 },
  timestamp: { fontSize: 12, color: "#777", marginTop: 4 },
  emptyText: { textAlign: "center", marginTop: 20, color: "#666" },
});
