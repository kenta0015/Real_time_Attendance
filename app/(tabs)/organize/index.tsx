// FILE: app/(tabs)/organize/index.tsx

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
  Linking,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";
import { useEffectiveRole, type Role } from "../../../stores/devRole";

type GroupRow = { id: string; name: string | null; description?: string | null };
type MembershipRow = { group_id: string };

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

const DEFAULT_DURATION_MINUTES = 60;

const nowIso = () => new Date().toISOString();
const plusHoursIso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function getEffectiveUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id;
  } catch {
    // ignore
  }
  const guest = await getGuestId();
  return guest;
}

function safeParseIso(isoUtc: string): Date {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function setLocalDateKeepTime(base: Date, newDate: Date): Date {
  return new Date(
    newDate.getFullYear(),
    newDate.getMonth(),
    newDate.getDate(),
    base.getHours(),
    base.getMinutes(),
    0,
    0
  );
}

function setLocalTimeKeepDate(base: Date, newTime: Date): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    newTime.getHours(),
    newTime.getMinutes(),
    0,
    0
  );
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildEndLocalOrNull(startLocal: Date, minutes: number): Date | null {
  const endLocal = new Date(startLocal.getTime() + minutes * 60_000);
  if (!isSameLocalDay(startLocal, endLocal)) return null;
  return endLocal;
}

export default function OrganizeIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gid?: string }>();
  const passedGid = typeof params.gid === "string" ? params.gid : undefined;

  const role: Role = useEffectiveRole();

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
  const [showAdvancedTime, setShowAdvancedTime] = useState(false);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("");
  const [radiusM, setRadiusM] = useState<string>("50");
  const [windowMin, setWindowMin] = useState<string>("30");
  const [submitting, setSubmitting] = useState(false);

  // Manage Groups modal
  const [manageOpen, setManageOpen] = useState(false);

  // Start picker (Phase A)
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [startPickerStep, setStartPickerStep] = useState<"date" | "time">("date");
  const [tempStartLocal, setTempStartLocal] = useState<Date>(() => safeParseIso(nowIso()));

  const notify = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("Info", msg);
  };

  const formatLocalDateTime = (isoUtc: string): string | null => {
    if (!isoUtc) return null;
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return null;

    try {
      return d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return d.toString();
    }
  };

  const startLocalDisplay = useMemo(() => formatLocalDateTime(startUtc), [startUtc]);
  const endLocalDisplay = useMemo(() => formatLocalDateTime(endUtc), [endUtc]);

  const tempStartPreview = useMemo(() => {
    try {
      return tempStartLocal.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return tempStartLocal.toString();
    }
  }, [tempStartLocal]);

  const fetchEventsForGroup = useCallback(async (gid: string | null) => {
    try {
      if (!gid) {
        setEvents([]);
        return;
      }

      const ev = await supabase
        .from("events")
        .select(
          "id, title, start_utc, end_utc, lat, lng, radius_m, window_minutes, location_name, group_id"
        )
        .eq("group_id", gid)
        .order("start_utc", { ascending: false })
        .limit(20);

      if (ev.error) throw ev.error;
      setEvents(ev.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load events");
      setEvents([]);
    }
  }, []);

  const fetchBootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const uid = await getEffectiveUserId();

      const memQuery = supabase.from("group_members").select("group_id").eq("user_id", uid);

      const memRes = role === "organizer" ? await memQuery.eq("role", "organizer") : await memQuery;

      if (memRes.error) throw memRes.error;

      const groupIds = ((memRes.data ?? []) as MembershipRow[]).map((m) => m.group_id);
      if (groupIds.length === 0) {
        setGroups([]);
        setEvents([]);
        setGroupId(null);
        return;
      }

      const grRes = await supabase
        .from("groups")
        .select("id, name, description")
        .in("id", groupIds)
        .order("created_at", { ascending: false });

      if (grRes.error) throw grRes.error;

      const list = (grRes.data ?? []) as GroupRow[];
      setGroups(list);

      const first = passedGid ?? list[0]?.id ?? null;
      setGroupId(first);

      await fetchEventsForGroup(first);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load groups");
      setGroups([]);
      setEvents([]);
      setGroupId(null);
    } finally {
      setLoading(false);
    }
  }, [fetchEventsForGroup, passedGid, role]);

  useEffect(() => {
    fetchBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchBootstrap();
    } finally {
      setRefreshing(false);
    }
  }, [fetchBootstrap]);

  const useLocalNow = useCallback(() => {
    const startLocal = new Date();
    const endLocal = buildEndLocalOrNull(startLocal, DEFAULT_DURATION_MINUTES);
    if (!endLocal) {
      Alert.alert(
        "Same-day only",
        `Start + ${DEFAULT_DURATION_MINUTES} minutes must stay within the same day. Please choose a different start time.`
      );
      return;
    }

    setStartUtc(startLocal.toISOString());
    setEndUtc(endLocal.toISOString());
    notify("Filled start/end from local now (stored as UTC ISO).");
  }, []);

  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Location permission is required to use current location.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLat(String(loc.coords.latitude));
      setLng(String(loc.coords.longitude));
      notify("Filled lat/lng from current location.");
    } catch (e: any) {
      Alert.alert("Location error", e?.message ?? "Failed to get current location");
    }
  }, []);

  const openManageGroups = useCallback(() => setManageOpen(true), []);

  const closeManageGroups = useCallback(() => setManageOpen(false), []);

  const openGroup = useCallback(
    (gid: string) => {
      closeManageGroups();
      router.push({ pathname: "/organize/admin", params: { gid } });
    },
    [closeManageGroups, router]
  );

  const validateIso = (s: string) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && s.includes("T") && s.endsWith("Z");
  };

  const closeStartPicker = useCallback(() => {
    setStartPickerOpen(false);
    setStartPickerStep("date");
  }, []);

  const openStartPickerIOS = useCallback(() => {
    setTempStartLocal(safeParseIso(startUtc));
    setStartPickerStep("date");
    setStartPickerOpen(true);
  }, [startUtc]);

  const commitStartPickerIOS = useCallback(() => {
    const endLocal = buildEndLocalOrNull(tempStartLocal, DEFAULT_DURATION_MINUTES);
    if (!endLocal) {
      Alert.alert(
        "Same-day only",
        `Start + ${DEFAULT_DURATION_MINUTES} minutes must stay within the same day. Please choose a different start time.`
      );
      return;
    }

    setStartUtc(tempStartLocal.toISOString());
    setEndUtc(endLocal.toISOString());
    notify("Start updated (End auto-set to +60 minutes).");
    closeStartPicker();
  }, [closeStartPicker, tempStartLocal]);

  const openStartPickerAndroid = useCallback(() => {
    const initial = safeParseIso(startUtc);

    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      is24Hour: true,
      onChange: (event, selectedDate) => {
        if (event?.type !== "set" || !selectedDate) return;

        const baseAfterDate = setLocalDateKeepTime(initial, selectedDate);

        DateTimePickerAndroid.open({
          value: baseAfterDate,
          mode: "time",
          is24Hour: true,
          onChange: (event2, selectedTime) => {
            if (event2?.type !== "set" || !selectedTime) return;

            const finalLocal = setLocalTimeKeepDate(baseAfterDate, selectedTime);
            const endLocal = buildEndLocalOrNull(finalLocal, DEFAULT_DURATION_MINUTES);

            if (!endLocal) {
              Alert.alert(
                "Same-day only",
                `Start + ${DEFAULT_DURATION_MINUTES} minutes must stay within the same day. Please choose a different start time.`
              );
              return;
            }

            setStartUtc(finalLocal.toISOString());
            setEndUtc(endLocal.toISOString());
            notify("Start updated (End auto-set to +60 minutes).");
          },
        });
      },
    });
  }, [startUtc]);

  const openStartPicker = useCallback(() => {
    if (Platform.OS === "android") openStartPickerAndroid();
    else openStartPickerIOS();
  }, [openStartPickerAndroid, openStartPickerIOS]);

  const createEvent = useCallback(async () => {
    if (!groupId) {
      Alert.alert("Missing group", "Please select a group first.");
      return;
    }

    const r = Number(radiusM);
    const w = Number(windowMin);

    if (!validateIso(startUtc)) {
      Alert.alert("Invalid start", "Start must be a valid UTC ISO string ending in Z.");
      return;
    }
    if (!validateIso(endUtc)) {
      Alert.alert("Invalid end", "End must be a valid UTC ISO string ending in Z.");
      return;
    }

    const startLocal = safeParseIso(startUtc);
    const expectedEndLocal = buildEndLocalOrNull(startLocal, DEFAULT_DURATION_MINUTES);
    if (!expectedEndLocal) {
      Alert.alert(
        "Same-day only",
        `Start + ${DEFAULT_DURATION_MINUTES} minutes must stay within the same day. Please pick a different start time.`
      );
      return;
    }

    if (!lat || !lng) {
      Alert.alert("Missing location", "Please fill venue lat and lng (or use current location).");
      return;
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) {
      Alert.alert("Invalid location", "Lat/lng must be numbers.");
      return;
    }
    if (Number.isNaN(r) || r <= 0) {
      Alert.alert("Invalid radius", "Radius must be a positive number.");
      return;
    }
    if (Number.isNaN(w) || w < 0) {
      Alert.alert("Invalid window", "Window must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        group_id: groupId,
        title: title.trim() ? title.trim() : null,
        start_utc: startUtc,
        end_utc: endUtc,
        lat: latN,
        lng: lngN,
        radius_m: r,
        window_minutes: w,
        location_name: locationName.trim() ? locationName.trim() : null,
      };

      const res = await supabase.from("events").insert(payload).select("id").single();
      if (res.error) throw res.error;

      notify("Event created.");
      setTitle("");
      setLocationName("");
      await fetchEventsForGroup(groupId);
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }, [endUtc, fetchEventsForGroup, groupId, lat, lng, locationName, radiusM, startUtc, title, windowMin]);

  const openEvent = useCallback(
    (eventId: string) => {
      router.push({ pathname: "/organize/events/[id]", params: { id: eventId } });
    },
    [router]
  );

  const openWebUrl = useCallback(async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error("Cannot open URL");
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert("Open link failed", e?.message ?? "Failed to open link");
    }
  }, []);

  const groupLabel = useMemo(() => {
    const g = groups.find((x) => x.id === groupId);
    return g?.name ?? "(Select group)";
  }, [groups, groupId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#6B7280" }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
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

          <View style={styles.row}>
            <Text style={[styles.label, styles.rowLabel]}>Group</Text>

            <TouchableOpacity style={styles.btnSmall} onPress={openManageGroups}>
              <Text style={styles.btnSmallText}>MANAGE GROUPS</Text>
            </TouchableOpacity>
          </View>

          {groups.length === 0 ? (
            <Text style={styles.help}>No groups found. Create a group first.</Text>
          ) : (
            <FlatList
              horizontal
              data={groups}
              keyExtractor={(g) => g.id}
              renderItem={({ item }) => {
                const active = item.id === groupId;
                return (
                  <TouchableOpacity
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={async () => {
                      setGroupId(item.id);
                      await fetchEventsForGroup(item.id);
                    }}
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
            <Text style={[styles.label, styles.rowLabel]}>Start (local)</Text>
            <TouchableOpacity style={styles.btnSmall} onPress={useLocalNow}>
              <Text style={styles.btnSmallText}>Use local now</Text>
            </TouchableOpacity>
          </View>

          <Pressable style={styles.pickerField} onPress={openStartPicker}>
            <Text style={startLocalDisplay ? styles.pickerText : styles.pickerPlaceholder}>
              {startLocalDisplay ?? "Tap to select start…"}
            </Text>
          </Pressable>

          <Text style={styles.label}>End (local)</Text>
          <Pressable
            style={styles.pickerField}
            onPress={() => console.log("[organize] End pressed (picker TODO)")}
          >
            <Text style={endLocalDisplay ? styles.pickerText : styles.pickerPlaceholder}>
              {endLocalDisplay ?? "Tap to select end…"}
            </Text>
          </Pressable>

          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedTime((v) => !v)}
          >
            <Text style={styles.advancedToggleText}>
              {showAdvancedTime ? "Hide advanced (UTC ISO)" : "Show advanced (UTC ISO)"}
            </Text>
          </TouchableOpacity>

          {showAdvancedTime ? (
            <View style={styles.advancedBlock}>
              <Text style={styles.label}>Start (UTC ISO)</Text>
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
            </View>
          ) : null}

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
              placeholder="lng (e.g. 145.0394)"
              value={lng}
              onChangeText={setLng}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>Venue name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Library Building A"
            value={locationName}
            onChangeText={setLocationName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>Radius (m)</Text>
              <TextInput
                style={styles.input}
                value={radiusM}
                onChangeText={setRadiusM}
                keyboardType="number-pad"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Window ± (min)</Text>
              <TextInput
                style={styles.input}
                value={windowMin}
                onChangeText={setWindowMin}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={createEvent}
            disabled={submitting}
          >
            <Text style={styles.primaryBtnText}>{submitting ? "Creating…" : "Create"}</Text>
          </TouchableOpacity>

          <Text style={styles.helpSmall}>
            You can type UTC ISO strings and lat/lng manually, or use the quick-fill buttons.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Organizer tools</Text>
          <Text style={styles.help}>You are signed in, but your role is not organizer.</Text>
          <Text style={[styles.help, { marginTop: 8 }]}>Current role: {String(role)}</Text>
          <TouchableOpacity
            style={[styles.btnSmall, { marginTop: 12, alignSelf: "flex-start" }]}
            onPress={() => router.push("/me")}
          >
            <Text style={styles.btnSmallText}>Go to Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent events</Text>

        {events.length === 0 ? (
          <Text style={styles.help}>No events yet.</Text>
        ) : (
          events.map((ev) => {
            const titleText = ev.title ?? "(Untitled event)";
            const start = ev.start_utc ?? "";
            const end = ev.end_utc ?? "";
            const loc = ev.location_name ?? "";
            return (
              <TouchableOpacity key={ev.id} style={styles.eventItem} onPress={() => openEvent(ev.id)}>
                <Text style={styles.eventTitle}>{titleText}</Text>
                <Text style={styles.eventMeta}>
                  {start} → {end}
                </Text>
                {loc ? <Text style={styles.eventMeta}>📍 {loc}</Text> : null}
                <Text style={styles.eventLink}>Open</Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 10 }} />

        <View style={styles.row}>
          <TouchableOpacity
            style={styles.btnSmall}
            onPress={() => {
              const gid = groupId ?? passedGid;
              if (!gid) {
                Alert.alert("Select a group", "Please select a group first.");
                return;
              }
              const url = `rta://organize?gid=${encodeURIComponent(gid)}`;
              openWebUrl(url);
            }}
          >
            <Text style={styles.btnSmallText}>Open deep link (rta://)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnSmall}
            onPress={() => router.push("/organize/location-test")}
          >
            <Text style={styles.btnSmallText}>Location test</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.helpSmall, { marginTop: 10 }]}>Selected group: {groupLabel}</Text>
      </View>

      <Modal visible={manageOpen} transparent animationType="fade" onRequestClose={closeManageGroups}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Manage groups</Text>
            <Text style={styles.modalBody}>Open a group admin screen.</Text>

            <View style={{ height: 10 }} />

            {groups.length === 0 ? (
              <Text style={styles.help}>No groups found.</Text>
            ) : (
              groups.map((g) => (
                <TouchableOpacity key={g.id} style={styles.modalRow} onPress={() => openGroup(g.id)}>
                  <Text style={styles.modalRowTitle}>{g.name ?? "(Untitled group)"}</Text>
                  {g.description ? <Text style={styles.modalRowDesc}>{g.description}</Text> : null}
                </TouchableOpacity>
              ))
            )}

            <View style={{ height: 12 }} />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalBtn} onPress={closeManageGroups}>
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={() => router.push("/organize/admin")}>
                <Text style={styles.modalPrimaryBtnText}>Open Admin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={startPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={closeStartPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.modalTitle}>
              {startPickerStep === "date" ? "Select start date" : "Select start time"}
            </Text>
            <Text style={styles.modalBody}>Preview: {tempStartPreview}</Text>

            <View style={{ height: 12 }} />

            {Platform.OS === "ios" ? (
              <DateTimePicker
                value={tempStartLocal}
                mode={startPickerStep}
                display="spinner"
                is24Hour
                onChange={(_, selected) => {
                  if (!selected) return;
                  if (startPickerStep === "date") {
                    setTempStartLocal((prev) => setLocalDateKeepTime(prev, selected));
                  } else {
                    setTempStartLocal((prev) => setLocalTimeKeepDate(prev, selected));
                  }
                }}
              />
            ) : null}

            <View style={{ height: 12 }} />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalBtn} onPress={closeStartPicker}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>

              {startPickerStep === "date" ? (
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={() => setStartPickerStep("time")}
                >
                  <Text style={styles.modalPrimaryBtnText}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.modalPrimaryBtn} onPress={commitStartPickerIOS}>
                  <Text style={styles.modalPrimaryBtnText}>Confirm</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: 8 }} />

            <Text style={styles.helpSmall}>Stored as UTC ISO (Z). Displayed in your local time.</Text>
          </View>
        </View>
      </Modal>
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "white",
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
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },

  pickerField: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: "white",
    justifyContent: "center",
  },
  pickerText: { color: "#111827" },
  pickerPlaceholder: { color: "#6B7280" },
  advancedToggle: { alignSelf: "flex-start", marginBottom: 10, marginTop: -2 },
  advancedToggleText: { color: "#2563EB", fontWeight: "700" },
  advancedBlock: { marginTop: 2 },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowLabel: { flex: 1 },
  rowInput: { flex: 1, marginRight: 10 },
  btnSmall: {
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "white",
  },
  btnSmallText: { fontWeight: "800", color: "#111827" },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
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
    padding: 12,
    marginBottom: 10,
  },
  eventTitle: { fontWeight: "800", color: "#111827", marginBottom: 4 },
  eventMeta: { color: "#6B7280", fontSize: 12, marginBottom: 2 },
  eventLink: { marginTop: 6, color: "#2563EB", fontWeight: "800" },
  primaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 2,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "white", fontWeight: "900" },
  center: { alignItems: "center", justifyContent: "center" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  pickerModalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6, color: "#111827" },
  modalBody: { color: "#6B7280", lineHeight: 18 },

  modalPrimaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  modalPrimaryBtnText: { color: "white", fontWeight: "900" },

  modalBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 10,
  },
  modalBtnText: { color: "#111827", fontWeight: "900" },

  modalFooter: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },

  modalRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  modalRowTitle: { fontWeight: "900", color: "#111827" },
  modalRowDesc: { color: "#6B7280", marginTop: 4, fontSize: 12 },
});
