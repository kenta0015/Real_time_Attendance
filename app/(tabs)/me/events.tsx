// app/(tabs)/me/events.tsx
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

export default function MyEventsScreen() {
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
    const attendedIds = Array.from(new Set((att.data ?? []).map((x: any) => x.event_id))).filter(
      Boolean
    ) as string[];

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
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>History</Text>

      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerText}>Error: {error}</Text>
        </View>
      ) : null}

      <Text style={styles.hint}>
        {role === "organizer"
          ? "History shows events you created on this device and events you checked into."
          : "History shows events this device checked into."}
      </Text>

      {section("ACTIVE", active, "green", role, router)}
      {section("UPCOMING", upcoming, "blue", role, router)}
      {section("PAST", past, "gray", role, router)}

      {active.length + upcoming.length + past.length === 0 ? (
        <View style={[styles.card, { marginTop: 8 }]}>
          <Text style={styles.help}>
            {role === "organizer"
              ? "No history yet. Create an event or check in to see it here."
              : "No history yet. Check in to an event to see it here."}
          </Text>
          <View style={{ height: 8 }} />
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/(tabs)/organize")}>
            <Text style={styles.btnText}>Go to Organize</Text>
          </TouchableOpacity>
        </View>
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
  title: string,
  rows: EventRow[],
  color: "green" | "blue" | "gray",
  role: Role,
  router: ReturnType<typeof useRouter>
) {
  if (rows.length === 0) return null;
  const badgeColor =
    color === "green" ? "#10B981" : color === "blue" ? "#3B82F6" : "#9CA3AF";

  return (
    <View style={styles.card} key={title}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      {rows.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={styles.item}
          activeOpacity={0.8}
          onPress={() => router.push(`/organize/events/${e.id}`)}
        >
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
                  style={{ border: 0, borderRadius: 10 }}
                  loading="lazy"
                />
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.btn, { paddingVertical: 10 }]}
                  onPress={() => Linking.openURL(mapsUrl(e.lat!, e.lng!, e.location_name))}
                >
                  <Text style={styles.btnText}>OPEN IN GOOGLE MAPS</Text>
                </TouchableOpacity>
              </View>
            )
          ) : null}

          {role === "organizer" ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btn, { paddingVertical: 10, flex: 1 }]}
                onPress={() => router.push(`/organize/events/${e.id}`)}
              >
                <Text style={styles.btnText}>OPEN DETAIL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { paddingVertical: 10, flex: 1 }]}
                onPress={() => router.push(`/organize/events/${e.id}/live`)}
              >
                <Text style={styles.btnText}>LIVE (ORGANIZER)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btn, { paddingVertical: 10 }]}
                onPress={() => router.push(`/organize/events/${e.id}`)}
              >
                <Text style={styles.btnText}>OPEN DETAIL</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  bannerError: {
    backgroundColor: "#FFEAEA",
    borderColor: "#FF8A8A",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  bannerText: { color: "#B00020" },
  hint: { color: "#6B7280", marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "white",
    padding: 12,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", marginLeft: 8 },
  badge: { width: 10, height: 10, borderRadius: 999 },
  item: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  eventTitle: { fontWeight: "700", marginBottom: 2 },
  meta: { color: "#6B7280" },
  metaSmall: { color: "#9CA3AF", fontSize: 12 },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "700" },
  help: { color: "#6B7280", textAlign: "center" },
  mapBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    overflow: "hidden",
  },
});
