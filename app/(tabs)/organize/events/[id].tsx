// app/(tabs)/organize/events/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../../../lib/supabase";

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

const BLUE = "#2563EB";
const CARD_BORDER = "#E5E7EB";

export default function OrganizeEventDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eid = useMemo(() => {
    const s = Array.isArray(params.id) ? params.id[0] : params.id;
    return s && s !== "undefined" ? s : null;
  }, [params.id]);

  // --- dev role (attendee/organizer) を監視 ---
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

  // --- 参加者は新UIへ即リダイレクト（ここが今回の要） ---
  useEffect(() => {
    if (role === "attendee" && eid) {
      router.replace(`/events/${eid}`); // 新しい参加者UIへ統一
    }
  }, [role, eid]);

  // --- イベント読み込み（主に主催者UI表示用） ---
  const [loading, setLoading] = useState(true);
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eid) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
          .from("events")
          .select(
            "id,title,start_utc,end_utc,venue_lat:lat,venue_lng:lng,venue_radius_m:radius_m,location_name"
          )
          .eq("id", eid)
          .maybeSingle();
        if (error) throw error;
        setEventRow((data as unknown as EventRow) ?? null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load event");
      } finally {
        setLoading(false);
      }
    })();
  }, [eid]);

  // --- 主催者向け操作 ---
  const openGoogleMaps = useCallback(() => {
    if (!eventRow?.venue_lat || !eventRow?.venue_lng) return;
    const name = eventRow.location_name?.trim();
    const q = name
      ? `${name} @ ${eventRow.venue_lat},${eventRow.venue_lng}`
      : `${eventRow.venue_lat},${eventRow.venue_lng}`;
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(q)}`);
  }, [eventRow]);

  if (role === "attendee") {
    // すでに replace を掛けているので、ここは一瞬だけ
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Redirecting to attendee view…</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Event</Text>
        <View style={styles.bannerError}>
          <Text style={styles.bannerText}>Error: {error}</Text>
        </View>
      </View>
    );
  }

  if (!eventRow) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Event</Text>
        <View style={styles.bannerError}>
          <Text style={styles.bannerText}>Event not found.</Text>
        </View>
      </View>
    );
  }

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

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <TouchableOpacity
          style={[styles.btnPrimary, { flex: 1 }]}
          onPress={() => router.push(`/organize/events/${eventRow.id}/live`)}
        >
          <Text style={styles.btnText}>LIVE (ORGANIZER)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimary, { flex: 1 }]}
          onPress={() => router.push(`/organize/events/${eventRow.id}/scan`)}
        >
          <Text style={styles.btnText}>SCAN QR (ORGANIZER)</Text>
        </TouchableOpacity>
      </View>

      {eventRow.venue_lat != null && eventRow.venue_lng != null ? (
        <View style={{ marginTop: 10 }}>
          <TouchableOpacity style={[styles.btnOutline]} onPress={openGoogleMaps}>
            <Text style={styles.btnOutlineText}>OPEN IN GOOGLE MAPS</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 20, fontWeight: "800", marginBottom: 12 },

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
    borderColor: CARD_BORDER,
    borderRadius: 12,
    backgroundColor: "white",
    padding: 12,
    marginBottom: 14,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
  rowValue: { color: "#111827", fontWeight: "700" },

  btnPrimary: {
    backgroundColor: BLUE,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "700" },

  btnOutline: {
    borderWidth: 2,
    borderColor: BLUE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnOutlineText: { color: BLUE, fontWeight: "700" },
});
