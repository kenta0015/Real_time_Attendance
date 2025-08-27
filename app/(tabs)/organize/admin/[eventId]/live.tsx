import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../../lib/supabase";

type Row = { event_id: string; user_id: string; checked_in_at_utc: string | null; lat: number | null; lng: number | null; accuracy_m: number | null; comment: string | null; };

export default function LiveAttendance() {
  const params = useLocalSearchParams();
  const eventId = typeof params.eventId === "string" ? params.eventId : undefined;

  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { (async () => {
    if (!eventId) { setError("Invalid event id."); return; }
    const { data, error } = await supabase.from("attendance").select("*").eq("event_id", eventId).order("checked_in_at_utc", { ascending: false });
    if (error) setError(error.message); setRows(data ?? []);
  })(); }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const channel = supabase.channel(`attendance:${eventId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${eventId}` },
      (payload: any) => {
        setRows((prev) => {
          const rec: any = payload.new ?? payload.old;
          const idx = prev.findIndex((r) => r.user_id === rec.user_id);
          const next = [...prev];
          if (payload.eventType === "DELETE") { if (idx >= 0) next.splice(idx, 1); return next; }
          if (idx >= 0) next[idx] = rec; else next.unshift(rec);
          return next;
        });
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  if (!eventId) return <View style={styles.container}><Text style={styles.title}>Invalid event id.</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Attendance</Text>
      <Text style={styles.caption}>event_id: {eventId}</Text>
      {error ? <Text style={{ color: "#b00020" }}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        contentContainerStyle={{ gap: 8, paddingTop: 8 }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.bold}>{item.user_id.slice(0, 8)}…</Text>
            <Text>{item.checked_in_at_utc ? new Date(item.checked_in_at_utc).toLocaleString() : "—"}</Text>
            <Text>
              {item.lat != null && item.lng != null ? `(${item.lat.toFixed(5)}, ${item.lng.toFixed(5)})` : "(no loc)"}
              {item.accuracy_m != null ? ` · ±${Math.round(item.accuracy_m)}m` : ""}
            </Text>
            {item.comment ? <Text>“{item.comment}”</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text>No check-ins yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700" },
  caption: { color: "#666" },
  item: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 10, backgroundColor: "#fafafa" },
  bold: { fontWeight: "700" },
});
