import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabase";

type Row = {
  event_id: string;
  user_id: string;
  checked_in_at_utc: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  comment: string | null;
};

export default function LiveAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("event_id, user_id, checked_in_at_utc, lat, lng, accuracy_m, comment")
        .eq("event_id", id);
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`attendance:live:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `event_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<Row>) => {
          setRows((prev) => {
            const rec = payload.new as Row;
            const idx = prev.findIndex((r) => r.user_id === rec.user_id);
            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = rec;
              return copy;
            }
            return [rec, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const render = ({ item }: { item: Row }) => (
    <View style={styles.item}>
      <Text style={styles.uid}>{item.user_id}</Text>
      <Text style={styles.meta}>
        {item.checked_in_at_utc ? new Date(item.checked_in_at_utc).toLocaleString() : "—"}
      </Text>
      <Text style={styles.meta}>
        {fmt(item.lat)} , {fmt(item.lng)} (±{fmt(item.accuracy_m)} m)
      </Text>
      {item.comment ? <Text style={styles.comment}>“{item.comment}”</Text> : null}
      {item.comment && item.comment.includes("[mocked]") ? (
        <Text style={styles.flag}>Needs review (mocked)</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live attendance</Text>
      {loading ? <Text>Loading…</Text> : null}
      <FlatList data={rows} keyExtractor={(r) => r.user_id} renderItem={render} />
    </View>
  );
}

function fmt(v: number | null) {
  return v == null ? "—" : String(Math.round((v as number) * 100) / 100);
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  uid: { fontWeight: "800" },
  meta: { color: "#555" },
  comment: { marginTop: 4, fontStyle: "italic" },
  flag: { marginTop: 4, color: "#B91C1C", fontWeight: "700" },
});
