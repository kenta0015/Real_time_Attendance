// app/(tabs)/screens/EventsList.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  DeviceEventEmitter,
  Linking,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";

// Common UI
import Card from "../../ui/Card";
import Button from "../../ui/Button";
import Pill from "../../ui/Pill";
import Tile from "../../ui/Tile";
import { COLORS, SPACING } from "../../ui/theme";

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

type EventRow = {
  id: string;
  title: string | null;
  start_utc: string | null;
  end_utc: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  window_minutes: number | null;
  location_name: string | null;
  group_id: string | null;
  created_by?: string | null;
};

export default function EventsListScreen() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("organizer");
  const [guestId, setGuestId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  const now = useMemo(() => Date.now(), [loading, role]);

  const notify = (m: string) =>
    Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert("Info", m);

  // --- fetch helpers ---
  const readRoleAndGuest = useCallback(async (): Promise<{ role: Role; guestId: string }> => {
    const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
    const r: Role = v === "attendee" ? "attendee" : "organizer";
    const gid = await getGuestId();
    return { role: r, guestId: gid };
  }, []);

  const fetchEventsFor = useCallback(async (gid: string, r: Role) => {
    // 1) attendance -> event_ids (this device)
    const att = await supabase
      .from("attendance")
      .select("event_id")
      .eq("user_id", gid)
      .order("checked_in_at_utc", { ascending: false })
      .limit(100);
    if (att.error) throw att.error;
    const attendedIds = Array.from(new Set((att.data ?? []).map((x: any) => x.event_id))).filter(Boolean) as string[];

    // 2) events created by me (organizer only)
    let created: EventRow[] = [];
    if (r === "organizer") {
      const cr = await supabase
        .from("events")
        .select(
          "id,title,start_utc,end_utc,lat,lng,radius_m,window_minutes,location_name,group_id,created_by"
        )
        .eq("created_by", gid)
        .order("start_utc", { ascending: false })
        .limit(50);
      if (cr.error) throw cr.error;
      created = (cr.data ?? []) as EventRow[];
    }

    // 3) attended event rows
    let attendedRows: EventRow[] = [];
    if (attendedIds.length > 0) {
      const ev = await supabase
        .from("events")
        .select(
          "id,title,start_utc,end_utc,lat,lng,radius_m,window_minutes,location_name,group_id,created_by"
        )
        .in("id", attendedIds)
        .limit(100);
      if (ev.error) throw ev.error;
      attendedRows = (ev.data ?? []) as EventRow[];
    }

    // 4) merge
    const merged = r === "organizer" ? dedupeById([...created, ...attendedRows]) : attendedRows;
    return merged;
  }, []);

  const initialLoad = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { role: r, guestId: gid } = await readRoleAndGuest();
      setRole(r);
      setGuestId(gid);
      const data = await fetchEventsFor(gid, r);
      setEvents(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [readRoleAndGuest, fetchEventsFor]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const { role: r, guestId: gid } = await readRoleAndGuest();
      setRole(r);
      setGuestId(gid);
      const data = await fetchEventsFor(gid, r);
      setEvents(data);
      notify("Refreshed");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [readRoleAndGuest, fetchEventsFor]);

  // boot + focus + role-change
  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  useFocusEffect(
    useCallback(() => {
      const sub = DeviceEventEmitter.addListener("rta_role_changed", initialLoad);
      return () => sub.remove();
    }, [initialLoad])
  );

  // ==== buckets ====
  const { active, upcoming, past } = useMemo(() => {
    const nowMs = Date.now();
    const parse = (s: string | null) => (s ? Date.parse(s) : NaN);

    const act: EventRow[] = [];
    const up: EventRow[] = [];
    const pa: EventRow[] = [];

    for (const e of events) {
      const ts = parse(e.start_utc);
      const te = parse(e.end_utc);
      if (Number.isNaN(ts) || Number.isNaN(te)) continue;
      if (ts <= nowMs && nowMs < te) act.push(e);
      else if (ts > nowMs) up.push(e);
      else pa.push(e);
    }

    act.sort((a, b) => Date.parse(a.start_utc!) - Date.parse(b.start_utc!));
    up.sort((a, b) => Date.parse(a.start_utc!) - Date.parse(b.start_utc!));
    pa.sort((a, b) => Date.parse(b.end_utc!) - Date.parse(a.end_utc!));

    return { active: act, upcoming: up, past: pa.slice(0, 20) };
  }, [events, now]);

  const counts = useMemo(
    () => ({
      active: active.length,
      upcoming: upcoming.length,
      past: past.length,
    }),
    [active, upcoming, past]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 28 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>History</Text>

      {/* Overview tiles */}
      <View style={styles.tilesRow}>
        <Tile label="Active" value={counts.active} />
        <Tile label="Upcoming" value={counts.upcoming} />
        <Tile label="Past" value={counts.past} />
      </View>

      {error ? (
        <Card variant="soft" style={{ borderColor: COLORS.danger }}>
          <Text style={{ color: COLORS.danger }}>Error: {error}</Text>
        </Card>
      ) : null}

      <Text style={styles.hint}>
        {role === "organizer"
          ? "History shows events you created on this device and events you checked into."
          : "History shows events this device checked into."}
      </Text>

      {section("ACTIVE", active, "success", role, router)}
      {section("UPCOMING", upcoming, "info", role, router)}
      {section("PAST", past, "neutral", role, router)}

      {active.length + upcoming.length + past.length === 0 ? (
        <Card style={{ marginTop: 8 }}>
          <Text style={styles.help}>
            {role === "organizer"
              ? "No history yet. Create an event or check in to see it here."
              : "No history yet. Check in to an event to see it here."}
          </Text>
          <View style={{ height: 8 }} />
          <Button title="Go To Organize" onPress={() => router.push("/organize")} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

function mapsUrl(lat: number, lng: number, label?: string | null) {
  const q = encodeURIComponent(label ? `${label} @ ${lat},${lng}` : `${lat},${lng}`);
  return `https://maps.google.com/?q=${q}`;
}
function embedUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

function dedupeById(list: EventRow[]) {
  const map = new Map<string, EventRow>();
  for (const e of list) {
    if (!e?.id) continue;
    map.set(e.id, e);
  }
  return Array.from(map.values());
}

function section(
  title: "ACTIVE" | "UPCOMING" | "PAST",
  rows: EventRow[],
  pillVariant: "success" | "info" | "neutral",
  role: Role,
  router: ReturnType<typeof useRouter>
) {
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: SPACING.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        <Pill text={title === "ACTIVE" ? "Active" : title === "UPCOMING" ? "Upcoming" : "Past"} variant={pillVariant} tone="soft" />
      </View>

      {rows.map((e) => (
        <Card key={e.id} style={{ marginTop: 10 }}>
          <Text style={styles.eventTitle}>{e.title ?? "(Untitled event)"}</Text>
          <Text style={styles.meta}>
            {e.start_utc ?? "—"} — {e.end_utc ?? "—"}
          </Text>
          <Text style={styles.metaSmall}>
            radius {e.radius_m ?? 0}m • window ±{e.window_minutes ?? 0}m
          </Text>

          {e.lat != null && e.lng != null ? (
            Platform.OS === "web" ? (
              <View style={styles.mapBox}>
                {/* @ts-ignore */}
                <iframe
                  src={embedUrl(e.lat, e.lng)}
                  width="100%"
                  height="160"
                  style={{ border: 0, borderRadius: 12 }}
                  loading="lazy"
                />
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Button
                  title="Open In Google Maps"
                  onPress={() => Linking.openURL(mapsUrl(e.lat!, e.lng!, e.location_name))}
                />
              </View>
            )
          ) : null}

          {role === "organizer" ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Open Detail"
                  onPress={() => router.push(`/organize/events/${e.id}`)}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Live (Organizer)"
                  onPress={() => router.push(`/organize/events/${e.id}/live`)}
                  fullWidth
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <Button title="Open Detail" onPress={() => router.push(`/organize/events/${e.id}`)} />
            </View>
          )}
        </Card>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, backgroundColor: COLORS.bg },
  header: { fontSize: 22, fontWeight: "800", marginBottom: 10, color: COLORS.text },
  hint: { color: COLORS.textMuted, marginBottom: 8 },

  tilesRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  cardTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  eventTitle: { fontWeight: "800", marginBottom: 2, color: COLORS.text },
  meta: { color: COLORS.textMuted },
  metaSmall: { color: COLORS.textSubtle, fontSize: 12 },
  help: { color: COLORS.textMuted, textAlign: "center" },

  mapBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
  },
});
