// app/(tabs)/organize/events/[id].tsx
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
} from "react-native";
import { useLocalSearchParams, router, usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { supabase } from "../../../../lib/supabase";
import { haversineMeters, accuracyThreshold } from "../../../../lib/geo";
import { getGuestId } from "../../../../stores/session";

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

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

  // === Route replace guard: DISABLED for stability ===========================
  const didRedirect = useRef(false);
  const targetPath = eid ? `/organize/events/${eid}` : null;
  useEffect(() => {
    // Keep a lightweight log for diagnostics; do not replace route.
    // This prevents flicker/empty frames and ensures buttons remain visible.
    console.log(
      "[guard-effect][DISABLED]",
      "role=",
      role,
      "eid=",
      eid,
      "at",
      pathname,
      "didRedirect=",
      didRedirect.current,
      "targetPath=",
      targetPath
    );
  }, [role, eid, pathname, targetPath]);

  // === Event row =============================================================
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
        const mapped = raw === "going" ? "going" : raw === "not_going" ? "not_going" : null;
        setRsvp(mapped as RSVPStatus);
      } else setRsvp(null);
    } catch {}
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
            { onConflict: "event_id,user_id" }
          );
        if (error) throw error;
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

  const handleGpsCheckin = useCallback(async () => {
    if (!eventRow) return;
    if (eventRow.venue_lat == null || eventRow.venue_lng == null) {
      Alert.alert("No venue location", "This event does not have a venue location.");
      return;
    }
    setGpsBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        Alert.alert("Permission needed", "Location permission is required.");
        setGpsBusy(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy ?? null;

      const radiusM = Number(eventRow.venue_radius_m ?? 120) || 120;
      const distM = haversineMeters(lat, lng, eventRow.venue_lat, eventRow.venue_lng);
      const accThresh = accuracyThreshold(radiusM);

      if (acc != null && acc > accThresh) {
        Alert.alert(
          "Location too inaccurate",
          `Reported accuracy ${Math.round(acc)}m > threshold ${Math.round(accThresh)}m. Move to open area and try again.`
        );
        setGpsBusy(false);
        return;
      }
      if (distM > radiusM) {
        Alert.alert("Outside gate", `Distance ${Math.round(distM)}m > radius ${radiusM}m.`);
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
    } catch (e: any) {
      const msg = e?.message ?? "GPS check-in failed.";
      Alert.alert("Failed", msg);
    } finally {
      setGpsBusy(false);
    }
  }, [eventRow]);

  // === DEV metrics panel (Accuracy / Distance / Inside) ======================
  const [devAcc, setDevAcc] = useState<number | null>(null);
  const [devDist, setDevDist] = useState<number | null>(null);
  const [devInside, setDevInside] = useState<boolean | null>(null);
  const [devBusy, setDevBusy] = useState(false);

  const refreshDevMetrics = useCallback(async () => {
    if (!eventRow) return;
    if (eventRow.venue_lat == null || eventRow.venue_lng == null) {
      Alert.alert("No venue location", "This event does not have a venue location.");
      return;
    }
    setDevBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        Alert.alert("Permission needed", "Location permission is required.");
        setDevBusy(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy ?? null;

      const radiusM = Number(eventRow.venue_radius_m ?? 120) || 120;
      const distM = haversineMeters(lat, lng, eventRow.venue_lat, eventRow.venue_lng);
      const accThresh = accuracyThreshold(radiusM);

      setDevAcc(acc);
      setDevDist(distM);
      setDevInside(acc == null || acc <= accThresh ? distM <= radiusM : null);
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Failed to refresh metrics.");
    } finally {
      setDevBusy(false);
    }
  }, [eventRow]);

  // === UI ====================================================================
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 20 }}>
          <ActivityIndicator />
          <Text style={styles.subtle}>Loading…</Text>
        </View>
      </View>
    );
  }
  if (error || !eventRow) {
    return (
      <View style={styles.container}>
        <Text style={[styles.h1, { color: "red" }]}>Failed to load</Text>
        <Text style={styles.subtle}>{error ?? "Unknown error"}</Text>
      </View>
    );
  }

  const inAttendeeMode = role === "attendee";

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{eventRow.title ?? "(Untitled event)"}</Text>

      <View style={styles.card}>
        <Row label="Start (UTC)" value={eventRow.start_utc ?? "—"} />
        <Row label="End (UTC)" value={eventRow.end_utc ?? "—"} />
        <Row label="Venue" value={eventRow.location_name || "—"} />
        <Row
          label="Lat/Lng"
          value={
            eventRow.venue_lat != null && eventRow.venue_lng != null
              ? `${eventRow.venue_lat.toFixed(6)}, ${eventRow.venue_lng.toFixed(6)}`
              : "—"
          }
        />
        <Row label="Radius (m)" value={String(eventRow.venue_radius_m ?? "—")} />
      </View>

      {inAttendeeMode ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.sectionLabel}>Your RSVP</Text>
          <View style={styles.rsvpRow}>
            <TouchableOpacity
              style={[styles.rsvpChip, rsvp === "going" && styles.rsvpChipActive]}
              onPress={() => saveRsvp("going")}
              disabled={rsvpBusy}
            >
              <Text style={[styles.rsvpChipText, rsvp === "going" && styles.rsvpChipTextActive]}>
                Going
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rsvpChip, rsvp === "not_going" && styles.rsvpChipActive]}
              onPress={() => saveRsvp("not_going")}
              disabled={rsvpBusy}
            >
              <Text
                style={[styles.rsvpChipText, rsvp === "not_going" && styles.rsvpChipTextActive]}
              >
                Not going
              </Text>
            </TouchableOpacity>
          </View>

          {Platform.OS !== "web" ? (
            <View style={styles.devPanel}>
              <Text style={styles.devTitle}>DEV — Metrics</Text>
              <Row label="Accuracy" value={devAcc == null ? "—" : `${Math.round(devAcc)}m`} />
              <Row
                label="Distance to venue"
                value={devDist == null ? "—" : `${Math.round(devDist)} m`}
              />
              <Row
                label="Inside radius?"
                value={
                  devInside == null ? "—" : devInside ? "Yes (inside)" : "No (outside)"
                }
              />
              <TouchableOpacity
                style={[styles.btnOutline, { marginTop: 8 }]}
                onPress={refreshDevMetrics}
                disabled={devBusy}
              >
                <Text style={styles.btnOutlineText}>
                  {devBusy ? "Refreshing…" : "REFRESH METRICS"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 10 }} />
          <TouchableOpacity style={[styles.btnOutline]} onPress={handleGpsCheckin} disabled={gpsBusy}>
            <Text style={styles.btnOutlineText}>{gpsBusy ? "Checking…" : "CHECK IN (GPS)"}</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() =>
              router.push({ pathname: "/attend/scan", params: { id: eventRow.id } } as any)
            }
          >
            <Text style={styles.btnOutlineText}>OPEN SCANNER</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/qr` as any)}
          >
            <Text style={styles.btnOutlineText}>SHOW EVENT QR</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.sectionLabel}>Organizer tools</Text>
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/checkin` as any)}
          >
            <Text style={styles.btnOutlineText}>OPEN CHECK-IN LIST</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/scan` as any)}
          >
            <Text style={styles.btnOutlineText}>OPEN SCANNER</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/qr` as any)}
          >
            <Text style={styles.btnOutlineText}>SHOW EVENT QR</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/invite` as any)}
          >
            <Text style={styles.btnOutlineText}>INVITE</Text>
          </TouchableOpacity>

          <View style={{ height: 10 }} />
          <TouchableOpacity
            style={[styles.btnOutline]}
            onPress={() => router.push(`/organize/events/${eventRow.id}/settings` as any)}
          >
            <Text style={styles.btnOutlineText}>SETTINGS</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 8 },
  h1: { fontSize: 24, fontWeight: "800", color: "#111", paddingHorizontal: 16, marginBottom: 8 },
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
  rsvpRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  linkBtn: {
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 12,
  },
  linkBtnText: {
    color: BLUE,
    fontWeight: "700",
  },
  devPanel: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    borderRadius: 12,
  },
  devTitle: {
    fontWeight: "800",
    marginBottom: 6,
    color: "#111",
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: BLUE,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  btnOutlineText: {
    color: BLUE,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  rsvpChip: {
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
