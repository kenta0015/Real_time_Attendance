// app/organize/events/[id]/history.tsx
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../lib/supabase";

// Common UI
import Card from "../../../ui/Card";
import Pill from "../../../ui/Pill";
// Tokens
import { COLORS, SPACING } from "@ui/theme";

type OvAudit = {
  id: number;
  changed_at: string;
  changed_by: string | null;
  event_id: string;
  user_id: string;
  action: string;
  old_is_on_time: boolean | null;
  old_is_late: boolean | null;
  old_left_early: boolean | null;
  old_note: string | null;
  new_is_on_time: boolean | null;
  new_is_late: boolean | null;
  new_left_early: boolean | null;
  new_note: string | null;
};

type GraceAudit = {
  id: number;
  changed_at: string;
  changed_by: string | null;
  event_id: string;
  old_grace_in_min: number | null;
  old_grace_out_min: number | null;
  new_grace_in_min: number | null;
  new_grace_out_min: number | null;
};

type Item = ({ kind: "override" } & OvAudit) | ({ kind: "grace" } & GraceAudit);

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = String(id);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [ov, gr] = await Promise.all([
        supabase
          .from("audit_attendance_override")
          .select("*")
          .eq("event_id", eventId)
          .order("changed_at", { ascending: false })
          .limit(200),
        supabase
          .from("audit_event_grace")
          .select("*")
          .eq("event_id", eventId)
          .order("changed_at", { ascending: false })
          .limit(200),
      ]);
      if (!mounted) return;
      const ovItems: Item[] = (ov.data ?? []).map((r: any) => ({
        kind: "override",
        ...r,
      }));
      const grItems: Item[] = (gr.data ?? []).map((r: any) => ({
        kind: "grace",
        ...r,
      }));
      const merged = [...ovItems, ...grItems].sort(
        (a, b) =>
          new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
      );
      setItems(merged);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Loading…</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={{
        backgroundColor: COLORS.bg,
        padding: SPACING.lg,
        gap: SPACING.sm,
      }}
      data={items}
      keyExtractor={(it) => `${it.kind}-${(it as any).id}`}
      renderItem={({ item }) => {
        if (item.kind === "override") {
          const it = item as Item & { kind: "override" };
          return (
            <Card variant="soft">
              <View style={styles.rowHeader}>
                <Pill text="OVERRIDE" variant="info" tone="filled" />
                <Text style={styles.time}>
                  {new Date(it.changed_at).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.meta}>
                user: {short(it.user_id)} • by: {short(it.changed_by ?? "—")}
              </Text>
              <Text style={styles.diff}>
                {it.action.toUpperCase()} → on:{fmt(it.new_is_on_time)} / late:
                {fmt(it.new_is_late)} / early:{fmt(it.new_left_early)}
                {it.new_note ? ` • note: ${it.new_note}` : ""}
              </Text>
            </Card>
          );
        } else {
          const it = item as Item & { kind: "grace" };
          return (
            <Card variant="soft">
              <View style={styles.rowHeader}>
                <Pill text="GRACE" variant="neutral" tone="filled" />
                <Text style={styles.time}>
                  {new Date(it.changed_at).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.meta}>by: {short(it.changed_by ?? "—")}</Text>
              <Text style={styles.diff}>
                IN: {fmtNum(it.old_grace_in_min)} → {fmtNum(it.new_grace_in_min)}
                {"  "} /  {"  "}
                OUT: {fmtNum(it.old_grace_out_min)} → {fmtNum(it.new_grace_out_min)}
              </Text>
            </Card>
          );
        }
      }}
    />
  );
}

function short(id: string) {
  return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-3)}`;
}
function fmt(v: any) {
  return v == null ? "—" : String(v);
}
function fmtNum(v: any) {
  return v == null ? "—" : String(v);
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    gap: 8,
  },
  dim: { color: COLORS.textMuted },

  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  time: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  diff: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginTop: 6 },
});




