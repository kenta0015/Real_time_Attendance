// app/(tabs)/organize/events/[id]/settings.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../../lib/supabase";

// Common UI
import Card from "../../../../ui/Card";
import Button from "../../../../ui/Button";
// Tokens
import { COLORS, SPACING, RADIUS } from "../../../../ui/theme";

type EventRow = {
  id: string;
  title: string | null;
  start_utc: string;
  end_utc: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  location_name: string | null;
  grace_in_min: number | null;
  grace_out_min: number | null;
};

export default function EventSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const eventId = String(id);

  const [row, setRow] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [graceIn, setGraceIn] = useState<string>("");
  const [graceOut, setGraceOut] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select(
          "id,title,start_utc,end_utc,lat,lng,radius_m,location_name,grace_in_min,grace_out_min"
        )
        .eq("id", eventId)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        Alert.alert("Error", error.message);
      } else if (data) {
        setRow(data as EventRow);
        setGraceIn(data.grace_in_min != null ? String(data.grace_in_min) : "");
        setGraceOut(
          data.grace_out_min != null ? String(data.grace_out_min) : ""
        );
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const header = useMemo(() => {
    if (!row) return null;
    return (
      <Card variant="elevated" style={{ marginBottom: SPACING.md }}>
        <Text style={styles.h1}>{row.title ?? "Event"}</Text>
        <Text style={styles.meta}>
          {new Date(row.start_utc).toLocaleString()} →{" "}
          {new Date(row.end_utc).toLocaleString()}
        </Text>
        <Text style={styles.meta}>
          Venue: {row.location_name ?? "—"} • {row.lat ?? "—"},{" "}
          {row.lng ?? "—"} • radius {row.radius_m ?? "—"} m
        </Text>
      </Card>
    );
  }, [row]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const gi =
        graceIn === "" ? null : Math.max(0, Math.min(60, Number(graceIn)));
      const go =
        graceOut === "" ? null : Math.max(0, Math.min(120, Number(graceOut)));
      if (Number.isNaN(gi as any) || Number.isNaN(go as any)) {
        Alert.alert("Invalid", "Please enter numbers.");
        setBusy(false);
        return;
      }
      const { error } = await supabase
        .from("events")
        .update({ grace_in_min: gi, grace_out_min: go })
        .eq("id", row.id);
      if (error) throw error;
      Alert.alert("Saved", "Grace windows updated.");
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Loading…</Text>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Event not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        {header}

        <Card>
          <Text style={styles.section}>Grace windows</Text>

          <Text style={styles.label}>
            Grace IN (minutes) — on-time window after start
          </Text>
          <TextInput
            style={styles.input}
            value={graceIn}
            onChangeText={setGraceIn}
            keyboardType="numeric"
            placeholder="e.g., 5"
            placeholderTextColor={COLORS.textSubtle}
          />

          <Text style={styles.label}>
            Grace OUT (minutes) — early-leave window before end
          </Text>
          <TextInput
            style={styles.input}
            value={graceOut}
            onChangeText={setGraceOut}
            keyboardType="numeric"
            placeholder="e.g., 10"
            placeholderTextColor={COLORS.textSubtle}
          />

          <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: 14 }}>
            <Button
              title={busy ? "Saving…" : "Save"}
              onPress={save}
              disabled={busy}
            />
            <Button title="Back" onPress={() => router.back()} variant="outline" />
          </View>
        </Card>

        <View style={{ height: SPACING.lg }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  dim: { color: COLORS.textMuted },

  h1: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  meta: { color: COLORS.textMuted, marginTop: 4 },

  section: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  label: { color: COLORS.text, marginTop: 10, marginBottom: 4, fontWeight: "700" },
  input: {
    backgroundColor: COLORS.cardBg,
    color: COLORS.text,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
