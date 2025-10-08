/// <reference lib="dom" />

import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { getGuestId } from "../../../stores/session";
import { haversineMeters } from "../../../lib/geo";
import { STR } from "../../../lib/strings";

type EventRow = {
  id: string;
  title: string;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_radius_m: number | null;
};

const HEARTBEAT_MS = 15_000; // minimal write when inside & stable
const DISTANCE_FILTER_M = 5;
const ACCURACY_GATE_M = 75;

const BLUE = "#2563EB";        // primary
const BLUE_SOFT = "#93C5FD";    // disabled-like
const CARD_BORDER = "#1f2937";

type Fix = { lat: number; lng: number; accM: number; ageMs: number; ts: number };

function fmt(n: number, unit: string) {
  return `${n.toFixed(0)} ${unit}`;
}

function resolveEventId(paramId?: string | string[]): string | null {
  const s = Array.isArray(paramId) ? paramId[0] : paramId;
  let v = s;
  if (!v || v === "undefined") {
    if (typeof window !== "undefined") {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => p === "events");
      if (i >= 0 && parts[i + 1]) v = parts[i + 1];
    }
  }
  if (!v || v === "undefined") return null;
  return v;
}

export default function Screen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = resolveEventId(params?.id);

  const [eventRow, setEventRow] = useState<EventRow | null>(null);

  // live fix state
  const [fix, setFix] = useState<Fix | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [goodAccuracy, setGoodAccuracy] = useState(false);
  const [insideRadius, setInsideRadius] = useState(false);

  // arrival
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  // heartbeat
  const lastHeartbeatAtRef = useRef(0);

  // location subscription
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;

    const start = async () => {
      try {
        const ok = await Location.getForegroundPermissionsAsync();
        if (!ok.granted) return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced, // lower power than BestForNavigation
            timeInterval: 1500,
            distanceInterval: DISTANCE_FILTER_M,
            mayShowUserSettingsDialog: true,
          },
          (p) => {
            if (stopped) return;
            const ts = Date.now();
            const ageMs = Math.max(0, ts - (p?.timestamp ?? ts));
            const accM = p?.coords?.accuracy ?? 9999;
            const lat = p?.coords?.latitude ?? 0;
            const lng = p?.coords?.longitude ?? 0;

            const f: Fix = { lat, lng, accM, ageMs, ts };
            setFix(f);

            const center = (eventRow?.venue_lat && eventRow?.venue_lng)
              ? { lat: eventRow.venue_lat, lng: eventRow.venue_lng }
              : null;

            if (center) {
              const d = haversineMeters(lat, lng, center.lat, center.lng);
              setDistanceM(d);
              setGoodAccuracy(accM <= ACCURACY_GATE_M);
              setInsideRadius(d <= (eventRow?.venue_radius_m ?? 0));
            }
          }
        );
        subRef.current = sub;
      } catch (e) {
        console.warn("watchPosition error", e);
        if (!stopped) {
          retryTimerRef.current = setTimeout(start, 2500);
        }
      }
    };

    start();

    return () => {
      stopped = true;
      if (subRef.current) {
        subRef.current.remove();
        subRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // derived measurements
  const center = useMemo(() => {
    if (!eventRow?.venue_lat || !eventRow?.venue_lng) return null;
    return { lat: eventRow.venue_lat, lng: eventRow.venue_lng };
  }, [eventRow]);

  const distLabel = useMemo(() => {
    if (distanceM == null) return "-";
    if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(2)} km`;
    return `${Math.max(0, Math.round(distanceM))} m`;
  }, [distanceM]);

  const accLabel = useMemo(() => {
    if (!fix) return "-";
    return `${Math.round(fix.accM)} m`;
  }, [fix]);

  const ageLabel = useMemo(() => {
    if (!fix) return "-";
    const s = Math.round(fix.ageMs / 1000);
    return `${s}s`;
  }, [fix]);

  // fetch event row
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,venue_lat,venue_lng,venue_radius_m")
        .eq("id", eventId)
        .maybeSingle();
      if (!error && data) setEventRow(data as EventRow);
    })();
  }, [eventId]);

  // check-in
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    (async () => setGuestId(await getGuestId()))();
  }, []);

  const arrivedEnabled = useMemo(() => {
    if (sending) return false;
    if (!insideRadius) return false;
    if (!goodAccuracy) return false;
    if (!fix || fix.ageMs > 6000) return false;
    return true;
  }, [sending, insideRadius, goodAccuracy, fix]);

  const sendArrival = async () => {
    if (!eventId || !guestId) {
      Alert.alert("Unavailable", "Missing event or user context");
      return;
    }
    try {
      setSending(true);
      const { error } = await supabase.rpc("qr_checkin_with_pin", {
        in_event_id: eventId,
        in_user_id: guestId,
        in_attend_pin: null, // GPS only
      });
      if (error) throw error;
      setSentAt(Date.now());
      Alert.alert("Checked in", "Your attendance was recorded.");
    } catch (e: any) {
      console.warn(e);
      Alert.alert("Failed", e?.message ?? "Please try again");
    } finally {
      setSending(false);
    }
  };

  // heartbeat: minimal write when stable inside
  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      if (!eventId || !insideRadius || !goodAccuracy) return;
      if (now - lastHeartbeatAtRef.current < HEARTBEAT_MS) return;
      lastHeartbeatAtRef.current = now;
      try {
        await supabase.from("events").update({ last_valid_seen_utc: new Date().toISOString() }).eq("id", eventId);
      } catch {}
    };
    const iv = setInterval(tick, 2000);
    return () => clearInterval(iv);
  }, [eventId, insideRadius, goodAccuracy]);

  // CTA handlers
  const openLocationSettings = () => {
    if (Platform.OS === "android") Linking.openSettings();
    else Linking.openURL("App-Prefs:Privacy&path=LOCATION");
  };
  const openMyQR = () => {
    router.push(`/organize/events/${eventId}/qr`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{eventRow?.title ?? "Event"}</Text>

      <View style={styles.card}>
        <Row label="Accuracy" value={accLabel} />
        <Row label="Distance to venue" value={distLabel} />
        <Row label="Fix age" value={ageLabel} />
        <Row label="Radius" value={eventRow?.venue_radius_m ? fmt(eventRow.venue_radius_m, "m") : "-"} />
        <Row label="Center" value={center ? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}` : "-"} />
      </View>

      <View style={styles.cta}>
        <Text style={styles.ctaTitle}>Check In</Text>
        <Text style={styles.ctaSub}>
          Get close to the venue and ensure your GPS accuracy is good.
        </Text>
        <TouchableOpacity
          disabled={!arrivedEnabled}
          onPress={sendArrival}
          style={[styles.btnPrimary, !arrivedEnabled && styles.btnPrimaryDisabled, { marginTop: 10 }]}
        >
          <Text style={styles.btnText}>{arrivedEnabled ? STR.checkInGPS : STR.waitingForGate}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cta}>
        <Text style={styles.ctaTitle}>Troubleshooting</Text>
        <Text style={styles.ctaSub}>If your location isn’t accurate, try enabling precise location.</Text>
        <View style={styles.ctaRow}>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={openLocationSettings}>
            <Text style={styles.btnText}>{STR.openSettings}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnOutline, { flex: 1 }]} onPress={openMyQR}>
            <Text style={styles.btnOutlineText}>{STR.showMyQR}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.tip}>
          <Text style={styles.tipText}>Tip: GPS works better in open areas; move closer to the venue marker.</Text>
        </View>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, gap: 16 },
  h1: { fontSize: 20, fontWeight: "800" },

  card: {
    backgroundColor: "#0b1220",
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rowLabel: { color: "#9CA3AF", fontSize: 13 },
  rowValue: { color: "#E5E7EB", fontWeight: "700" },

  cta: { marginTop: 10, backgroundColor: "#1f2430", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334", gap: 10 },
  ctaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  ctaSub: { color: "#c9d1d9" },
  ctaRow: { flexDirection: "row", gap: 10 },

  // === Buttons (blue unified) ===
  btnPrimary: { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnPrimaryDisabled: { backgroundColor: BLUE_SOFT },
  btnText: { color: "#fff", fontWeight: "700" },

  btnOutline: { borderWidth: 2, borderColor: BLUE, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnOutlineText: { color: BLUE, fontWeight: "700" },

  tip: { backgroundColor: "#111317", borderRadius: 10, padding: 10 },
  tipText: { color: "#96a0aa", fontSize: 12 },
});
