// app/(tabs)/organize/index.tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Pressable,
} from "react-native";
import { Link } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";

type Group = { id: string; name: string; description: string | null };
type EventRow = {
  id: string;
  title: string;
  start_utc: string;
  end_utc: string;
  location_name: string | null;
};

export default function OrganizeHome() {
  const [guestId, setGuestId] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Group form
  const [gName, setGName] = useState("");
  const [gDesc, setGDesc] = useState("");

  // Event form
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [startISO, setStartISO] = useState("");
  const [endISO, setEndISO] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("50");
  const [windowMin, setWindowMin] = useState("30");
  const [locationName, setLocationName] = useState("");
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getGuestId();
      setGuestId(id);
      fetchGroups();
    })();
  }, []);

  useEffect(() => {
    if (selectedGroupId) fetchEvents(selectedGroupId);
  }, [selectedGroupId]);

  async function fetchGroups() {
    setLoading(true);
    const { data, error } = await supabase
      .from("groups")
      .select("id,name,description")
      .order("created_at", { ascending: false });
    if (error) Alert.alert("Error", error.message);
    setGroups(data ?? []);
    if ((data?.length ?? 0) > 0 && !selectedGroupId) setSelectedGroupId(data![0].id);
    setLoading(false);
  }

  async function fetchEvents(groupId: string) {
    setLoadingEvents(true);
    const { data, error } = await supabase
      .from("events")
      .select("id,title,start_utc,end_utc,location_name")
      .eq("group_id", groupId)
      .order("start_utc", { ascending: false });
    if (error) Alert.alert("Error", error.message);
    setEvents(data ?? []);
    setLoadingEvents(false);
  }

  async function createGroup() {
    if (!gName.trim()) return Alert.alert("Validation", "Group name is required.");
    const { data, error } = await supabase
      .from("groups")
      .insert({ name: gName.trim(), description: gDesc.trim() || null, created_by: guestId })
      .select("id")
      .single();
    if (error) return Alert.alert("Error", error.message);
    await supabase.from("group_members").insert({ group_id: data.id, user_id: guestId, role: "organizer" });
    setGName("");
    setGDesc("");
    await fetchGroups();
    Alert.alert("Success", "Group created.");
  }

  async function createEvent() {
    if (!selectedGroupId) return Alert.alert("Validation", "Select a group.");
    if (!title.trim()) return Alert.alert("Validation", "Title is required.");
    if (!startISO || !endISO) return Alert.alert("Validation", "Start/End UTC required.");
    if (!lat || !lng) return Alert.alert("Validation", "Lat/Lng required.");
    const { error } = await supabase.from("events").insert({
      group_id: selectedGroupId,
      title: title.trim(),
      start_utc: startISO,
      end_utc: endISO,
      lat: Number(lat),
      lng: Number(lng),
      radius_m: Number(radius || 50),
      window_minutes: Number(windowMin || 30),
      location_name: locationName.trim() || null,
      created_by: guestId,
    });
    if (error) return Alert.alert("Error", error.message);
    setTitle("");
    setStartISO("");
    setEndISO("");
    setLat("");
    setLng("");
    setRadius("50");
    setWindowMin("30");
    setLocationName("");
    await fetchEvents(selectedGroupId);
    Alert.alert("Success", "Event created.");
  }

  // 現在地→lat/lng
  async function setCurrentLocation() {
    try {
      setLocBusy(true);
      let status = (await Location.getForegroundPermissionsAsync()).status;
      if (status !== Location.PermissionStatus.GRANTED) {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status !== Location.PermissionStatus.GRANTED) {
        Alert.alert("Permission needed", "Please allow location to set current coordinates.");
        return;
      }
      if (Platform.OS === "android") {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          Alert.alert("Turn on Location", "Please enable device location (GPS) and try again.");
          return;
        }
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(String(pos.coords.latitude ?? ""));
      setLng(String(pos.coords.longitude ?? ""));
    } catch (e: any) {
      Alert.alert("Location error", e?.message ?? "Failed to get current location.");
    } finally {
      setLocBusy(false);
    }
  }

  // 端末のローカル時刻をUTC ISOにしてセット（例：開始=今、終了=+1h）
  function setNowRange(hours = 1) {
    const now = new Date();
    const start = now.toISOString(); // UTC保存
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    setStartISO(start);
    setEndISO(end);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#fff" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Organizer</Text>
          <Text style={styles.caption}>Guest ID: {guestId ? guestId.slice(0, 8) + "…" : "…"}</Text>

          <View style={styles.card}>
            <Text style={styles.h2}>Create Group</Text>
            <TextInput style={styles.input} placeholder="Group name" value={gName} onChangeText={setGName} />
            <TextInput style={styles.input} placeholder="Description (optional)" value={gDesc} onChangeText={setGDesc} />
            <Button title="Create Group" onPress={createGroup} />
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>My Groups</Text>
            {loading ? <Text>Loading…</Text> : null}
            {groups.length === 0 ? (
              <Text>No groups yet.</Text>
            ) : (
              <View style={{ gap: 6 }}>
                {groups.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => setSelectedGroupId(g.id)}
                    style={[styles.groupItem, selectedGroupId === g.id && styles.groupItemActive]}
                  >
                    <Text style={styles.groupName}>{g.name}</Text>
                    {g.description ? <Text style={styles.groupDesc}>{g.description}</Text> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Events in selected group</Text>
            {loadingEvents ? <Text>Loading…</Text> : null}
            {events.length === 0 ? (
              <Text>No events yet.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {events.map((ev) => (
                  <View key={ev.id} style={styles.eventItem}>
                    <Text style={styles.eventTitle}>{ev.title}</Text>
                    <Text style={styles.eventMeta}>
                      {new Date(ev.start_utc).toLocaleString()} — {new Date(ev.end_utc).toLocaleString()}
                    </Text>
                    <Text style={styles.eventMeta}>{ev.location_name ?? "(no name)"}</Text>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                      <Link href={{ pathname: "/(tabs)/organize/events/[id]", params: { id: ev.id } }} asChild>
                        <Button title="Open detail" onPress={() => {}} />
                      </Link>
                      <Link href={{ pathname: "/(tabs)/organize/admin/[eventId]/live", params: { eventId: ev.id } }} asChild>
                        <Button title="Live (Organizer)" onPress={() => {}} />
                      </Link>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>Create Event (UTC / numeric lat,lng)</Text>
            <Text style={styles.label}>Group: {selectedGroupId ? selectedGroupId.slice(0, 8) + "…" : "-"}</Text>

            <TextInput style={styles.input} placeholder="Title" value={title} onChangeText={setTitle} />

            <TextInput
              style={styles.input}
              placeholder="Start UTC (e.g. 2025-08-26T04:30:00Z)"
              value={startISO}
              onChangeText={setStartISO}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              Local preview: {startISO ? new Date(startISO).toLocaleString() : "—"}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="End UTC (e.g. 2025-08-26T05:30:00Z)"
              value={endISO}
              onChangeText={setEndISO}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              Local preview: {endISO ? new Date(endISO).toLocaleString() : "—"}
            </Text>

            <View style={{ marginTop: 6, marginBottom: 6 }}>
              <Button title="Use local now → save UTC (end +1h)" onPress={() => setNowRange(1)} />
            </View>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Lat (e.g. -37.8136)"
                value={lat}
                onChangeText={setLat}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Lng (e.g. 144.9631)"
                value={lng}
                onChangeText={setLng}
                keyboardType="numeric"
              />
            </View>
            <View style={{ marginTop: 6, marginBottom: 6 }}>
              <Button
                title={locBusy ? "Getting current location…" : "Use current location"}
                onPress={setCurrentLocation}
                disabled={locBusy}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Radius m (default 50)"
                value={radius}
                onChangeText={setRadius}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Window min (±, default 30)"
                value={windowMin}
                onChangeText={setWindowMin}
                keyboardType="numeric"
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Location name (optional)"
              value={locationName}
              onChangeText={setLocationName}
            />
            <Button title="Create Event" onPress={createEvent} />
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16 },
  h1: { fontSize: 22, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  caption: { color: "#666" },
  card: {
    backgroundColor: "#fafafa",
    borderColor: "#e5e5e5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  groupItem: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
  },
  groupItemActive: { backgroundColor: "#eaf6ff", borderColor: "#cbe9ff" },
  groupName: { fontWeight: "600" },
  groupDesc: { color: "#666", marginTop: 4, fontSize: 12 },
  label: { color: "#555" },
  eventItem: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  eventTitle: { fontWeight: "700" },
  eventMeta: { color: "#666" },
  hint: { color: "#666", fontSize: 12, marginTop: -4, marginBottom: 6 },
});
