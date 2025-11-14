// app/(tabs)/organize/events/[id].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  DeviceEventEmitter,
  Linking,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, router, usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { supabase } from "../../../../lib/supabase";
import { haversineMeters, accuracyThreshold } from "../../../../lib/geo";
import { getGuestId } from "../../../../stores/session";

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

// --- Geofence constants ------------------------------------------------------
const GEOFENCE_TASK = "rta/geofence.v1";
const ARM_KEY = "rta_geofence_arm_event_id";

type EventRow = {
  id: string;
  title: string | null;
  start_utc: string | null;
  end_utc: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_radius_m: number | null;
  location_name?: string | null;
};

type RSVPStatus = "going" | "not_going" | null;

const BLUE = "#2563EB";
const CARD_BORDER = "#E5E7EB";

// --- helpers -----------------------------------------------------------------
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

async function getEffectiveUserId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (uid && uid.length > 0) return uid;
  } catch {}
  return await getGuestId();
}

function clampRadius(input?: number | null) {
  const v = input ?? 100;
  // B: clamp between 100–150m
  return Math.min(150, Math.max(100, Math.floor(v)));
}

function regionForEvent(e: EventRow): Location.LocationRegion {
  return {
    identifier: `event:${e.id}`,
    latitude: e.venue_lat ?? 0,
    longitude: e.venue_lng ?? 0,
    radius: clampRadius(e.venue_radius_m),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

function parseEventIdFromIdentifier(id?: string | null) {
  if (!id) return null;
  const m = /^event:(.+)$/.exec(id);
  return m ? m[1] : null;
}

async function getDeviceLabel(): Promise<string> {
  // Dynamic require to avoid hard dependency when the module is missing
  let label = Platform.OS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device: any = require("expo-device");
    label =
      Device?.modelName ||
      Device?.deviceName ||
      Device?.manufacturer ||
      Platform.OS;
  } catch {
    // module not installed; keep fallback string
  }
  return label;
}

async function notify(title: string, body?: string) {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) {
      await Notifications.requestPermissionsAsync();
    }
    await Notifications.scheduleNotificationAsync({
      content: { title, body: body ?? "" },
      trigger: null,
    });
  } catch {}
}

// --- Background task (define once) -------------------------------------------
if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
    try {
      if (error) {
        console.warn("[geofence] task error:", error);
        return;
      }
      const payload = (data ?? {}) as any;
      const eventType: number | undefined = payload?.eventType;
      const region: Location.LocationRegion | undefined = payload?.region;

      const dir: "ENTER" | "EXIT" =
        eventType === Location.GeofencingEventType.Enter ? "ENTER" : "EXIT";
      const at = new Date();

      const eventId = parseEventIdFromIdentifier(region?.identifier) ?? null;

      const { data: udata } = await supabase.auth.getUser();
      const userId = udata?.user?.id ?? null;

      const device = await getDeviceLabel();

      const minuteKey = at.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      const idem = `${eventId ?? "?"}:${userId ?? "?"}:${dir}:${minuteKey}`;

      // Optional: get last known accuracy (best-effort)
      let acc: number | null = null;
      try {
        const last = await Location.getLastKnownPositionAsync();
        acc = last?.coords?.accuracy ?? null;
      } catch {}

      await supabase
        .from("geofence_events")
        .upsert(
          {
            event_id: eventId,
            user_id: userId,
            dir,
            at: at.toISOString(),
            region_id: region?.identifier ?? null,
            acc_m: acc == null ? null : Math.round(acc),
            device,
            idem,
          },
          { onConflict: "idem" }
        );

      await notify(
        `Geofence ${dir}`,
        `${region?.identifier ?? "region"} @ ${minuteKey}`
      );

      try {
        DeviceEventEmitter.emit("rta_geofence_event", {
          dir,
          event_id: eventId,
          at: at.toISOString(),
        });
      } catch {}
    } catch (e) {
      console.warn("[geofence] handler exception]:", e);
    }
  });
}

// =============================================================================
export default function OrganizeEventDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eid = useMemo(() => {
    const s = (params.id ?? "").toString();
    return s && s !== "undefined" ? s : null;
  }, [params.id]);

  console.log("[A-2 LOADED] /organize/events/[id].tsx");

  const pathname = usePathname();
  const renders = useRef(0);
  useEffect(() => {
    renders.current += 1;
    console.log("[route]", pathname, "id=", eid, "renders=", renders.current);
  }, [pathname, eid]);

  const [role, setRole] = useState<Role>("organizer");
  const loadRole = useCallback(async () => {
    const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
    setRole(v === "attendee" ? "attendee" : "organizer");
  }, []);
  useEffect(() => {
    loadRole();
    const sub = DeviceEventEmitter.addListener("rta_role_changed", loadRole);
    return () => sub.remove();
  }, [loadRole]);

  // === Event load ============================================================
  const [loading, setLoading] = useState(true);
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eid) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("events")
          .select(
            "id,title,start_utc,end_utc,venue_lat:lat,venue_lng:lng,venue_radius_m:radius_m,location_name"
          )
          .eq("id", eid)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Event not found.");
        setEventRow(data as unknown as EventRow);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load event.");
      } finally {
        setLoading(false);
      }
    })();
  }, [eid]);

  // === RSVP (Attendee) ================================================
  const [rsvp, setRsvp] = useState<RSVPStatus | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);

  const loadRsvp = useCallback(async () => {
    if (!eid) return;
    try {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("event_members")
        .select("rsvp_status")
        .eq("event_id", eid)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data?.rsvp_status) {
        const raw = String(data.rsvp_status);
        const mapped =
          raw === "going" ? "going" : raw === "not_going" ? "not_going" : null;
        setRsvp(mapped as RSVPStatus);
      } else setRsvp(null);
    } catch (e: any) {
      console.warn("[rsvp] load failed:", e?.message);
      setRsvp(null);
    }
  }, [eid]);

  useEffect(() => {
    loadRsvp();
  }, [loadRsvp]);

  const saveRsvp = useCallback(
    async (next: RSVPStatus) => {
      if (!eid) return;
      try {
        setRsvpBusy(true);
        setRsvp(next); // optimistic
        const userId = await getEffectiveUserId();
        const { error } = await supabase
          .from("event_members")
          .upsert(
            {
              event_id: eid,
              user_id: userId,
              rsvp_status: next,
              invite_source: "rsvp",
            },
            {
              onConflict: "event_id,user_id",
            }
          );
        if (error) throw error;
        Alert.alert("Saved", `RSVP: ${next ?? "—"}`);
      } catch (e: any) {
        Alert.alert("Failed to save RSVP", e?.message ?? "Unknown error");
        loadRsvp();
      } finally {
        setRsvpBusy(false);
      }
    },
    [eid, loadRsvp]
  );

  // === GPS check-in ==========================================================
  const [gpsBusy, setGpsBusy] = useState(false);
  const [lastCheckinAt, setLastCheckinAt] = useState<string | null>(null);

  const handleGpsCheckin = useCallback(async () => {
    if (!eventRow) return;

    try {
      setGpsBusy(true);
      // 1) Permissions
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        const ask = await Location.requestForegroundPermissionsAsync();
        if (ask.status !== "granted") {
          Alert.alert("Permission required", "Location permission is required.");
          setGpsBusy(false);
          return;
        }
      }

      // 2) Current position (high accuracy)
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });

      const radiusM = eventRow.venue_radius_m ?? 100;
      const distM = haversineMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        eventRow.venue_lat ?? 0,
        eventRow.venue_lng ?? 0
      );
      const accThresh = accuracyThreshold(radiusM);

      if ((pos.coords.accuracy ?? 9999) > accThresh) {
        Alert.alert(
          "Low accuracy",
          `Accuracy ${Math.round(pos.coords.accuracy ?? 0)}m > threshold ${Math.round(
            accThresh
          )}m. Move to open area and try again.`
        );
        setGpsBusy(false);
        return;
      }
      if (distM > radiusM) {
        Alert.alert(
          "Outside gate",
          `Distance ${Math.round(distM)}m > radius ${radiusM}m.`
        );
        setGpsBusy(false);
        return;
      }

      const userId = await getEffectiveUserId();
      const { error } = await supabase.from("attendance").insert({
        event_id: eventRow.id,
        user_id: userId,
        method: "gps",
      });
      if (error) throw error;

      Alert.alert("Checked in", "GPS check-in recorded.");
      try {
        setLastCheckinAt(new Date().toISOString());
      } catch {}
      try {
        DeviceEventEmitter.emit("rta_attendance_changed", {
          event_id: eventRow.id,
        });
      } catch {}
    } catch (e: any) {
      const msg = e?.message ?? "GPS check-in failed.";
      Alert.alert("Failed", msg);
    } finally {
      setGpsBusy(false);
    }
  }, [eventRow]);

  // === DEV metrics panel =====================================================
  const [devAcc, setDevAcc] = useState<number | null>(null);
  const [devDist, setDevDist] = useState<number | null>(null);
  const [devInside, setDevInside] = useState<boolean | null>(null);
  const [devBusy, setDevBusy] = useState(false);

  const refreshMetrics = useCallback(async () => {
    if (!eventRow) return;
    try {
      setDevBusy(true);
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const distM = haversineMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        eventRow.venue_lat ?? 0,
        eventRow.venue_lng ?? 0
      );
      setDevAcc(pos.coords.accuracy ?? null);
      setDevDist(distM);
      setDevInside(distM <= (eventRow.venue_radius_m ?? 100));
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Unable to refresh metrics.");
    } finally {
      setDevBusy(false);
    }
  }, [eventRow]);

  // === Geofence: arm / disarm / status ======================================
  const [armBusy, setArmBusy] = useState(false);
  const [disarmBusy, setDisarmBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>("—");

  const ensureBGPermissions = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      const ask = await Location.requestForegroundPermissionsAsync();
      if (ask.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Location permission is required to use geofencing."
        );
        return false;
      }
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      const ask = await Location.requestBackgroundPermissionsAsync();
      if (ask.status !== "granted") {
        Alert.alert(
          "Always allow required",
          "Please set Location permission to “Allow all the time”.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => {
                try {
                  Linking.openSettings();
                } catch {}
              },
            },
          ]
        );
        return false;
      }
    }
    return true;
  }, []);

  const refreshGeoStatus = useCallback(async () => {
    try {
      const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
      const armedFor = (await AsyncStorage.getItem(ARM_KEY)) ?? "";
      setGeoStatus(
        started
          ? armedFor
            ? `Armed (event ${armedFor})`
            : "Armed"
          : "Disarmed"
      );
    } catch {
      setGeoStatus("Unknown");
    }
  }, []);

  useEffect(() => {
    refreshGeoStatus();
  }, [refreshGeoStatus]);

  const armGeofence = useCallback(async () => {
    if (!eventRow) return;
    try {
      setArmBusy(true);
      const ok = await ensureBGPermissions();
      if (!ok) return;

      const region = regionForEvent(eventRow);

      await Location.startGeofencingAsync(GEOFENCE_TASK, [region]);

      await AsyncStorage.setItem(ARM_KEY, eventRow.id);
      await notify("Geofence armed", `${region.identifier}`);

      setGeoStatus(`Armed (event ${eventRow.id})`);
    } catch (e: any) {
      Alert.alert("Arm failed", e?.message ?? "Unable to arm geofence.");
    } finally {
      setArmBusy(false);
    }
  }, [eventRow, ensureBGPermissions]);

  const disarmGeofence = useCallback(async () => {
    try {
      setDisarmBusy(true);
      const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
      if (started) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
      }
      await AsyncStorage.removeItem(ARM_KEY);
      await notify("Geofence disarmed");
      setGeoStatus("Disarmed");
    } catch (e: any) {
      Alert.alert("Disarm failed", e?.message ?? "Unable to disarm geofence.");
    } finally {
      setDisarmBusy(false);
    }
  }, []);

  const showGeoStatus = useCallback(async () => {
    await refreshGeoStatus();
    Alert.alert("Geofence status", geoStatus);
  }, [geoStatus, refreshGeoStatus]);

  const handleDeleteEvent = useCallback(() => {
    if (!eventRow) return;
    Alert.alert(
      "Delete event",
      "This will permanently delete this event. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleteBusy(true);
              try {
                await disarmGeofence();
              } catch {}
              const { error } = await supabase
                .from("events")
                .delete()
                .eq("id", eventRow.id);
              if (error) throw error;
              try {
                Alert.alert("Deleted", "Event has been deleted.");
              } catch {}
              router.replace("/events");
            } catch (e: any) {
              Alert.alert(
                "Delete failed",
                e?.message ?? "Unable to delete event."
              );
            } finally {
              setDeleteBusy(false);
            }
          },
        },
      ]
    );
  }, [eventRow, disarmGeofence]);

  // === Render guards =========================================================
  if (!eid) {
    return (
      <View
        style={[styles.container, { justifyContent: "center", alignItems: "center" }]}
      >
        <Text>Invalid route: missing id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={[styles.container, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator />
        <Text style={styles.subtle}>Loading…</Text>
      </View>
    );
  }

  if (error || !eventRow) {
    return (
      <View
        style={[styles.container, { justifyContent: "center", alignItems: "center" }]}
      >
        <Text style={{ color: "crimson" }}>{error ?? "Event not found"}</Text>
      </View>
    );
  }

  // === UI ====================================================================
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <Text style={styles.h1}>{eventRow.title ?? "Event"}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Event</Text>
        <Row label="Start (UTC)" value={String(eventRow.start_utc ?? "—")} />
        <Row label="End (UTC)" value={String(eventRow.end_utc ?? "—")} />
        <Row label="Location" value={String(eventRow.location_name ?? "—")} />
        <Row
          label="Center (lat,lng)"
          value={`${eventRow.venue_lat ?? 0}, ${eventRow.venue_lng ?? 0}`}
        />
        <Row label="Radius (m)" value={String(eventRow.venue_radius_m ?? 100)} />
      </View>

      {role === "attendee" ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>RSVP</Text>
          <View style={styles.rsvpRow}>
            <TouchableOpacity
              style={[styles.rsvpChip, rsvp === "going" && styles.rsvpChipActive]}
              onPress={() => saveRsvp("going")}
              disabled={rsvpBusy}
            >
              <Text
                style={[
                  styles.rsvpChipText,
                  rsvp === "going" && styles.rsvpChipTextActive,
                ]}
              >
                Going
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rsvpChip, rsvp === "not_going" && styles.rsvpChipActive]}
              onPress={() => saveRsvp("not_going")}
              disabled={rsvpBusy}
            >
              <Text
                style={[
                  styles.rsvpChipText,
                  rsvp === "not_going" && styles.rsvpChipTextActive,
                ]}
              >
                Not going
              </Text>
            </TouchableOpacity>
          </View>

          {Platform.OS !== "web" ? (
            <View style={styles.devPanel}>
              <Text style={styles.devTitle}>DEV — Metrics</Text>
              <Row
                label="Accuracy"
                value={devAcc == null ? "—" : `${Math.round(devAcc)}m`}
              />
              <Row
                label="Distance to venue"
                value={devDist == null ? "—" : `${Math.round(devDist)} m`}
              />
              <Row
                label="Inside radius?"
                value={
                  devInside == null
                    ? "—"
                    : devInside
                    ? "Yes (inside)"
                    : "No (outside)"
                }
              />
              <TouchableOpacity
                style={[styles.btnOutline, devBusy && { opacity: 0.6 }]}
                onPress={refreshMetrics}
                disabled={devBusy}
              >
                <Text style={styles.btnOutlineText}>
                  {devBusy ? "Refreshing…" : "REFRESH METRICS"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={handleGpsCheckin}
            disabled={gpsBusy}
          >
            <Text style={styles.btnOutlineText}>
              {gpsBusy ? "Checking…" : "CHECK IN (GPS)"}
            </Text>
          </TouchableOpacity>

          {lastCheckinAt ? (
            <Text style={[styles.subtle, { textAlign: "center" }]}>
              LAST CHECK-IN: {new Date(lastCheckinAt).toLocaleString()}
            </Text>
          ) : null}

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push({ pathname: "/attend/scan" } as any)}
          >
            <Text style={styles.btnOutlineText}>OPEN SCANNER</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Organizer</Text>

          {/* Geofence controls */}
          <Row label="Geofence" value={geoStatus} />
          <View style={{ height: 8 }} />
          <TouchableOpacity
            style={[styles.btnPrimary, armBusy && { opacity: 0.6 }]}
            onPress={armGeofence}
            disabled={armBusy || deleteBusy}
          >
            <Text style={styles.btnPrimaryText}>
              {armBusy ? "Arming…" : "ARM GEOFENCE"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
          <TouchableOpacity
            style={[styles.btnOutline, disarmBusy && { opacity: 0.6 }]}
            onPress={disarmGeofence}
            disabled={disarmBusy || deleteBusy}
          >
            <Text style={styles.btnOutlineText}>
              {disarmBusy ? "Disarming…" : "DISARM GEOFENCE"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={showGeoStatus}
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>STATUS</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnPrimary, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/qr",
                params: { id: eventRow.id },
              })
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnPrimaryText}>SHOW EVENT QR</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/scan",
                params: { id: eventRow.id },
              } as any)
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>SCAN (ORGANIZER)</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/live",
                params: { id: eventRow.id },
              } as any)
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>LIVE (ORGANIZER)</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/checkin",
                params: { id: eventRow.id },
              })
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>CHECK-IN LIST</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/invite",
                params: { id: eventRow.id },
              })
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>INVITE</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline, deleteBusy && { opacity: 0.6 }]}
            onPress={() =>
              router.push({
                pathname: "/organize/events/[id]/settings",
                params: { id: eventRow.id },
              })
            }
            disabled={deleteBusy}
          >
            <Text style={styles.btnOutlineText}>SETTINGS</Text>
          </TouchableOpacity>

          <View style={{ height: 16 }} />
          <TouchableOpacity
            style={[styles.btnDanger, deleteBusy && { opacity: 0.6 }]}
            onPress={handleDeleteEvent}
            disabled={deleteBusy}
          >
            <Text style={styles.btnDangerText}>
              {deleteBusy ? "DELETING…" : "DELETE EVENT"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 20 }} />
      <TouchableOpacity
        style={[styles.linkBtn]}
        onPress={() =>
          Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${eventRow.venue_lat},${eventRow.venue_lng}`
          )
        }
      >
        <Text style={styles.linkBtnText}>OPEN IN GOOGLE MAPS</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 8 },
  scrollContent: {
    paddingBottom: 24,
  },
  h1: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  subtle: { color: "#555", marginTop: 8 },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: { color: "#374151", fontWeight: "600" },
  rowValue: { color: "#111827" },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    marginTop: 6,
    marginBottom: 8,
  },
  devPanel: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    paddingTop: 8,
  },
  devTitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 6,
    fontWeight: "700",
  },
  btnPrimary: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnOutlineText: {
    color: BLUE,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  btnDanger: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#DC2626",
  },
  btnDangerText: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  linkBtn: {
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  linkBtnText: {
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  rsvpRow: {
    flexDirection: "row",
    gap: 8,
  },
  rsvpChip: {
    borderWidth: 1,
    borderColor: BLUE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  rsvpChipActive: {
    backgroundColor: BLUE,
  },
  rsvpChipText: {
    fontWeight: "700",
    color: BLUE,
  },
  rsvpChipTextActive: {
    color: "#fff",
  },
});
