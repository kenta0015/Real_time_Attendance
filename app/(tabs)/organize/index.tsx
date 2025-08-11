// app/(tabs)/organize/index.tsx
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, View } from "react-native";
import type { Database } from "../../../types/database";
import { styles } from "./styles";

import GroupsSection from "./component/GroupsSection";
import EventsSection from "./component/EventsSection";
import GroupModal from "./component/GroupModal";
import EventModal from "./component/EventModal";

import { useAuthOrganizer } from "./useAuthOrganizer";
import {
  fetchGroupsApi,
  fetchEventsApi,
  createGroupApi,
  updateGroupApi,
  createEventApi,
  updateEventApi,
} from "./api";

type Group = Database["public"]["Tables"]["groups"]["Row"];
type GroupInsert = Database["public"]["Tables"]["groups"]["Insert"];
type GroupUpdate = Database["public"]["Tables"]["groups"]["Update"];
type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
type Mode = "create" | "edit";

export default function OrganizerToolsScreen() {
  const { isConfigured, userId, isOrganizer, loading } = useAuthOrganizer();

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupMode, setGroupMode] = useState<Mode>("create");
  const [gName, setGName] = useState("");
  const [gCategory, setGCategory] = useState("");
  const [gDesc, setGDesc] = useState("");

  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventMode, setEventMode] = useState<Mode>("create");
  const [eTitle, setETitle] = useState("");
  const [eCategory, setECategory] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eLocationName, setELocationName] = useState("");
  const [eLat, setELat] = useState<string>("");
  const [eLng, setELng] = useState<string>("");
  const [eDesc, setEDesc] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    (async () => {
      if (!userId || !isOrganizer) return;
      const { data, error } = await fetchGroupsApi(userId);
      if (error) return Alert.alert("Error", error);
      setGroups(data);
    })();
  }, [userId, isOrganizer]);

  const selectGroup = async (g: Group) => {
    setSelectedGroup(g);
    const { data, error } = await fetchEventsApi(g.id);
    if (error) return Alert.alert("Error", error);
    setEvents(data);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const openCreateGroup = () => {
    setGroupMode("create");
    setGName("");
    setGCategory("");
    setGDesc("");
    setGroupModalVisible(true);
  };
  const openEditGroup = (g: Group) => {
    setGroupMode("edit");
    setSelectedGroup(g);
    setGName(g.name ?? "");
    setGCategory(g.category ?? "");
    setGDesc(g.description ?? "");
    setGroupModalVisible(true);
  };

  const submitGroup = async () => {
    if (!userId) return;
    if (!gName.trim()) return Alert.alert("Validation", "Group name is required.");

    if (groupMode === "create") {
      const payload: GroupInsert = {
        name: gName.trim(),
        category: gCategory.trim() || "General",
        description: gDesc.trim() || null,
        organizer_id: userId,
      };
      const res = await createGroupApi(payload);
      if (res.error) return Alert.alert("Save Error", res.error);
    } else if (groupMode === "edit" && selectedGroup) {
      const payload: GroupUpdate = {
        name: gName.trim(),
        category: gCategory.trim() || "General",
        description: gDesc.trim() || null,
      };
      const res = await updateGroupApi(selectedGroup.id, payload);
      if (res.error) return Alert.alert("Save Error", res.error);
    }
    setGroupModalVisible(false);
    setSelectedGroup(null);
    const r = await fetchGroupsApi(userId);
    if (r.error) Alert.alert("Error", r.error);
    else setGroups(r.data);
  };

  const openCreateEvent = () => {
    setEventMode("create");
    setETitle("");
    setECategory("");
    setEStart("");
    setEEnd("");
    setELocationName("");
    setELat("");
    setELng("");
    setEDesc("");
    setSelectedEvent(null);
    setEventModalVisible(true);
  };
  const openEditEvent = (ev: EventRow) => {
    setEventMode("edit");
    setSelectedEvent(ev);
    setETitle(ev.title ?? "");
    setECategory(ev.category ?? "");
    setEStart(ev.start_time ?? "");
    setEEnd(ev.end_time ?? "");
    setELocationName(ev.location_name ?? "");
    setELat(String(ev.latitude ?? ""));
    setELng(String(ev.longitude ?? ""));
    setEDesc(ev.description ?? "");
    setEventModalVisible(true);
  };

  const submitEvent = async () => {
    if (!userId || !selectedGroup) return;
    if (!eTitle.trim() || !eStart.trim() || !eEnd.trim() || !eLocationName.trim()) {
      return Alert.alert("Validation", "Title, Start, End, and Location are required.");
    }
    const start = new Date(eStart);
    const end = new Date(eEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Alert.alert("Validation", "Start/End must be valid ISO datetime.");
    }
    if (end.getTime() <= start.getTime()) {
      return Alert.alert("Validation", "End time must be after Start time.");
    }
    const lat = eLat ? Number(eLat) : 0;
    const lng = eLng ? Number(eLng) : 0;
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return Alert.alert("Validation", "Latitude/Longitude must be numbers.");
    }

    if (eventMode === "create") {
      const payload: EventInsert = {
        group_id: selectedGroup.id,
        title: eTitle.trim(),
        description: eDesc.trim() || null,
        category: eCategory.trim() || "General",
        start_time: eStart,
        end_time: eEnd,
        location_name: eLocationName.trim(),
        latitude: lat,
        longitude: lng,
        is_recurring: false,
        recurrence_pattern: null,
        created_by: userId,
      };
      const res = await createEventApi(payload);
      if (res.error) return Alert.alert("Save Error", res.error);
      if (!res.rows || res.rows < 1) {
        return Alert.alert("Save Warning", "No rows returned. Check RLS or constraints.");
      }
    } else if (eventMode === "edit" && selectedEvent) {
      const payload: EventUpdate = {
        title: eTitle.trim(),
        description: eDesc.trim() || null,
        category: eCategory.trim() || "General",
        start_time: eStart,
        end_time: eEnd,
        location_name: eLocationName.trim(),
        latitude: lat,
        longitude: lng,
        is_recurring: selectedEvent.is_recurring ?? false,
        recurrence_pattern: selectedEvent.recurrence_pattern ?? null,
      };
      const res = await updateEventApi(selectedEvent.id, payload);
      if (res.error) return Alert.alert("Save Error", res.error);
      if (!res.rows || res.rows < 1) {
        return Alert.alert("Save Warning", "No rows returned. Check RLS or constraints.");
      }
    }

    setEventModalVisible(false);
    const r = await fetchEventsApi(selectedGroup.id);
    if (r.error) Alert.alert("Error", r.error);
    else setEvents(r.data);
  };

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.header}>Organizer Tools</Text>
        <Text style={{ color: "#b91c1c", marginTop: 8 }}>
          Supabase is not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
        </Text>
      </SafeAreaView>
    );
  }
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!userId) {
    return (
      <View style={styles.center}>
        <Text>Please sign in to use organizer tools.</Text>
      </View>
    );
  }
  if (!isOrganizer) {
    return (
      <View style={styles.center}>
        <Text>You are not an organizer. Ask an admin to grant organizer role.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }}>
        {selectedGroup && (
          <EventsSection
            group={selectedGroup}
            events={events}
            onCreate={openCreateEvent}
            onEdit={openEditEvent}
          />
        )}

        <Text style={styles.header}>Organizer Tools</Text>

        <GroupsSection
          groups={groups}
          onCreate={openCreateGroup}
          onSelect={selectGroup}
          onEdit={openEditGroup}
        />
      </ScrollView>

      <GroupModal
        visible={groupModalVisible}
        mode={groupMode}
        gName={gName}
        setGName={setGName}
        gCategory={gCategory}
        setGCategory={setGCategory}
        gDesc={gDesc}
        setGDesc={setGDesc}
        onCancel={() => setGroupModalVisible(false)}
        onSave={submitGroup}
      />

      <EventModal
        visible={eventModalVisible}
        mode={eventMode}
        eTitle={eTitle}
        setETitle={setETitle}
        eCategory={eCategory}
        setECategory={setECategory}
        eStart={eStart}
        setEStart={setEStart}
        eEnd={eEnd}
        setEEnd={setEEnd}
        eLocationName={eLocationName}
        setELocationName={setELocationName}
        eLat={eLat}
        setELat={setELat}
        eLng={eLng}
        setELng={setELng}
        eDesc={eDesc}
        setEDesc={setEDesc}
        onCancel={() => setEventModalVisible(false)}
        onSave={submitEvent}
      />
    </SafeAreaView>
  );
}
