import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  ToastAndroid,
  DeviceEventEmitter,
  Linking,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

const enableDev =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

type GroupRow = { id: string; name: string | null; description?: string | null };
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
};

const nowIso = () => new Date().toISOString();
const plusHoursIso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function getEffectiveUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (uid && uid.length > 0) return uid;
  } catch {}
  return await getGuestId();
}

export default function OrganizeIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gid?: string }>();
  const passedGid = typeof params.gid === "string" ? params.gid : undefined;

  const [role, setRole] = useState<Role>("organizer");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // form
  const [title, setTitle] = useState<string>("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [startUtc, setStartUtc] = useState<string>(nowIso());
  const [endUtc, setEndUtc] = useState<string>(plusHoursIso(1));
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("");
  const [radiusM, setRadiusM] = useState<string>("50");
  const [windowMinutes, setWindowMinutes] = useState<string>("30");
  const [submitting, setSubmitting] = useState(false);

  const notify = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("Info", msg);
  };

  const loadRole = useCallback(async () => {
    try {
      if (!enableDev) {
        console.log("[OrganizeIndex] loadRole -> force organizer (enableDev=false)");
        setRole("organizer");
        return;
      }
      const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
      const r: Role = v === "attendee" ? "attendee" : "organizer";
      console.log("[OrganizeIndex] loadRole ->", r);
      setRole(r);
    } catch (e) {
      console.log("[OrganizeIndex] loadRole error", e);
      setRole("organizer");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRole();
      if (!enableDev) {
        console.log("[OrganizeIndex] focus -> skip role_changed listener (enableDev=false)");
        return;
      }
      const sub = DeviceEventEmitter.addListener("rta_role_changed", loadRole);
      return () => sub.remove();
    }, [loadRole])
  );

  const fetchBootstrap = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [gr, ev] = await Promise.all([
        supabase.from("groups").select("id, name, description").order("name", { ascending: true }),
        supabase
          .from("events")
          .select(
            "id, title, start_utc, end_utc, lat, lng, radius_m, window_minutes, location_name, group_id"
          )
          .order("start_utc", { ascending: false })
          .limit(20),
      ]);
      if (gr.error) throw gr.error;
      if (ev.error) throw ev.error;
      setGroups(gr.data ?? []);
      setEvents(ev.data ?? []);
      if (!groupId) {
        const prefer =
          (passedGid && (gr.data ?? []).find((g) => g.id === passedGid)?.id) ||
          (gr.data && gr.data[0]?.id) ||
          null;
        if (prefer) setGroupId(prefer);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [groupId, passedGid]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      await fetchBootstrap();
      notify("Refreshed");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [fetchBootstrap]);

  const useLocalNow = () => {
    const s = nowIso();
    const e = plusHoursIso(1);
    setStartUtc(s);
    setEndUtc(e);
    notify("Start/End set to now +1h (UTC ISO)");
  };

  const useCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location", "Permission denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
      notify("Coordinates filled from current location");
    } catch (e: any) {
      Alert.alert("Location error", e?.message ?? "Failed to get location");
    }
  };

  const isIso = (s: string) => !Number.isNaN(Date.parse(s));
  const toNum = (s: string) => Number(s);
  const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

  const canSubmit = useMemo(() => {
    if (!groupId) return false;
    if (!isIso(startUtc) || !isIso(endUtc)) return false;
    if (Date.parse(endUtc) <= Date.parse(startUtc)) return false;
    const nLat = toNum(lat);
    const nLng = toNum(lng);
    if (!inRange(nLat, -90, 90) || !inRange(nLng, -180, 180)) return false;
    const r = toNum(radiusM);
    const w = toNum(windowMinutes);
    if (!Number.isFinite(r) || r < 1) return false;
    if (!Number.isFinite(w) || w < 0) return false;
    return true;
  }, [groupId, startUtc, endUtc, lat, lng, radiusM, windowMinutes]);

  const onCreate = async () => {
    if (!canSubmit) {
      Alert.alert("Invalid form", "Fill group, times, lat/lng, radius, window.");
      return;
    }
    setSubmitting(true);
    try {
      const createdBy = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("create_event_safe", {
        p_title: title,
        p_group_id: groupId,
        p_start_utc: new Date(startUtc).toISOString(),
        p_end_utc: new Date(endUtc).toISOString(),
        p_lat: Number(lat),
        p_lng: Number(lng),
        p_radius_m: Math.round(Number(radiusM)),
        p_window_minutes: Math.round(Number(windowMinutes)),
        p_location_name: locationName?.trim() || "",
        p_created_by: createdBy,
      });
      if (error) throw error;
      const newId = data as unknown as string;
      notify("Event created");
      await fetchBootstrap();
      if (newId) router.push(`/organize/events/${newId}`);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>Organize</Text>

      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerText}>Error: {error}</Text>
        </View>
      ) : null}

      {role === "organizer" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create event</Text>

          <Text style={styles.label}>Group</Text>
          {groups.length === 0 ? (
            <Text style={styles.help}>No groups. Create one first.</Text>
          ) : (
            <FlatList
              data={groups}
              keyExtractor={(g) => g.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const active = groupId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setGroupId(item.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item.name ?? "(Untitled group)"}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={{ height: 12 }} />

          <Text style={styles.label}>Title (optional — server fills if blank)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Math 101 — Quiz 2"
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.row}>
            <Text style={[styles.label, styles.rowLabel]}>Start (UTC ISO)</Text>
            <TouchableOpacity style={styles.btnSmall} onPress={useLocalNow}>
              <Text style={styles.btnSmallText}>Use local now</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.inputMono}
            placeholder="e.g. 2025-08-28T05:18:02.660Z"
            value={startUtc}
            onChangeText={setStartUtc}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>End (UTC ISO)</Text>
          <TextInput
            style={styles.inputMono}
            placeholder="e.g. 2025-08-28T06:18:02.660Z"
            value={endUtc}
            onChangeText={setEndUtc}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.row}>
            <Text style={[styles.label, styles.rowLabel]}>Venue lat / lng</Text>
            <TouchableOpacity style={styles.btnSmall} onPress={useCurrentLocation}>
              <Text style={styles.btnSmallText}>Use current location</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <TextInput
              style={[styles.inputMono, styles.rowInput]}
              placeholder="lat (e.g. -37.9025)"
              value={lat}
              onChangeText={setLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.inputMono, styles.rowInput]}
              placeholder="lng (e.g. 145.0742)"
              value={lng}
              onChangeText={setLng}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>Venue name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Main gate"
            value={locationName}
            onChangeText={setLocationName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Radius (m)</Text>
              <TextInput
                style={styles.inputMono}
                placeholder="50"
                value={radiusM}
                onChangeText={setRadiusM}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Window ± (min)</Text>
              <TextInput
                style={styles.inputMono}
                placeholder="30"
                value={windowMinutes}
                onChangeText={setWindowMinutes}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={{ height: 12 }} />
          <TouchableOpacity
            disabled={!canSubmit || submitting}
            style={[styles.btn, (!canSubmit || submitting) && styles.btnDisabled]}
            onPress={onCreate}
          >
            <Text style={styles.btnText}>{submitting ? "Creating..." : "Create"}</Text>
          </TouchableOpacity>
          <Text style={styles.helpSmall}>
            You can type UTC ISO strings and lat/lng manually, or use the quick-fill buttons.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent events</Text>
        {events.length === 0 ? (
          <Text style={styles.help}>No events yet.</Text>
        ) : (
          events.map((e) => (
            <View key={e.id} style={styles.eventItem}>
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
                      src={`https://www.google.com/maps?q=${e.lat},${e.lng}&z=15&output=embed`}
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
                      onPress={() =>
                        Linking.openURL(
                          `https://maps.google.com/?q=${encodeURIComponent(
                            e.location_name ? `${e.location_name} @ ${e.lat},${e.lng}` : `${e.lat},${e.lng}`
                          )}`
                        )
                      }
                    >
                      <Text style={styles.btnText}>OPEN IN GOOGLE MAPS</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : null}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.btn, { paddingVertical: 10 }]}
                  onPress={() => router.push(`/organize/events/${e.id}`)}
                >
                  <Text style={styles.btnText}>OPEN DETAIL</Text>
                </TouchableOpacity>
                {role === "organizer" ? (
                  <TouchableOpacity
                    style={[styles.btn, { paddingVertical: 10 }]}
                    onPress={() => router.push(`/organize/events/${e.id}/live`)}
                  >
                    <Text style={styles.btnText}>LIVE (ORGANIZER)</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "white",
    padding: 12,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  label: { fontWeight: "600", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: "white",
  },
  inputMono: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: "white",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowLabel: { marginBottom: 6 },
  rowInput: { flex: 1 },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "white", fontWeight: "700" },
  btnSmall: {
    backgroundColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  btnSmallText: { color: "white", fontWeight: "700", fontSize: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "white",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { color: "#111827", fontWeight: "600" },
  chipTextActive: { color: "white", fontWeight: "700" },
  help: { color: "#6B7280" },
  helpSmall: { color: "#6B7280", marginTop: 6, fontSize: 12 },
  eventItem: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  eventTitle: { fontWeight: "700", marginBottom: 2 },
  meta: { color: "#6B7280" },
  metaSmall: { color: "#9CA3AF", fontSize: 12 },
  mapBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    overflow: "hidden",
  },
});
