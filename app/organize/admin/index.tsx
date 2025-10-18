import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase"; // ← ここが正解

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

type EventRow = {
  id: string;
  title: string | null;
  start_utc: string | null;
  end_utc: string | null;
};

export default function AdminHub() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("organizer");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadRole = useCallback(async () => {
    const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
    setRole(v === "attendee" ? "attendee" : "organizer");
  }, []);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("id,title,start_utc,end_utc")
      .order("start_utc", { ascending: false })
      .limit(20);
    setEvents((data ?? []) as EventRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      await loadRole();
      if (role === "attendee") {
        router.replace("/me/groups");
        return;
      }
      await loadEvents();
      setLoading(false);
    })();
  }, [loadRole, loadEvents, role, router]);

  if (role === "attendee" || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Admin</Text>
        <View style={styles.card}>
          <Text style={styles.text}>No events yet.</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.push("/organize")}
          >
            <Text style={styles.btnText}>Create event</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin</Text>

      <View style={styles.card}>
        <Text style={styles.text}>Select an event</Text>

        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => {
            const active = selectedId === item.id;
            return (
              <TouchableOpacity
                style={[styles.row, active && styles.rowActive]}
                onPress={() => setSelectedId(item.id)}
              >
                <Text style={[styles.rowText, active && styles.rowTextActive]}>
                  {item.title ?? "(Untitled)"} — {item.start_utc ?? "—"}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        <View style={{ height: 12 }} />

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            disabled={!selectedId}
            style={[styles.btn, !selectedId && styles.btnDisabled]}
            onPress={() => selectedId && router.push(`/organize/events/${selectedId}`)}
          >
            <Text style={styles.btnText}>Open detail</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!selectedId}
            style={[styles.btn, !selectedId && styles.btnDisabled]}
            onPress={() =>
              selectedId && router.push(`/organize/events/${selectedId}/live`)
            }
          >
            <Text style={styles.btnText}>Open live</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  card: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "white",
  },
  text: { marginBottom: 8 },
  row: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 10 },
  rowActive: { backgroundColor: "#111827" },
  rowText: { color: "#111827", fontWeight: "600" },
  rowTextActive: { color: "white", fontWeight: "700" },
  btn: {
    backgroundColor: "#111827", paddingVertical: 12, borderRadius: 10, alignItems: "center", flex: 1,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "white", fontWeight: "700" },
});




