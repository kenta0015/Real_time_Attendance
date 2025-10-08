// app/organize/events/[id]/live.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
  Platform,
  Alert,
  ToastAndroid,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { armGeofenceAt, disarmGeofence, geofenceStatus } from "@/lib/geofenceActions";

// Common UI
import Button from "../../../ui/Button";
import Card from "../../../ui/Card";
import Pill from "../../../ui/Pill";
import Tile from "../../../ui/Tile";
// Tokens bridge
import { COLORS, SPACING, RADIUS } from "../../../ui/theme";

type StatusRow = {
  event_id: string;
  user_id: string;
  is_on_time: boolean;
  is_late: boolean;
  left_early: boolean;
  override_note: string | null;
};

type AttendRow = {
  event_id: string;
  user_id: string;
  checked_in_at_utc: string | null;
  last_valid_seen_utc: string | null;
  method: string | null;
};

type FinalizedRow = {
  event_id: string;
  user_id: string;
  final_rank: number;
};

type MergedRow = {
  user_id: string;
  is_on_time: boolean;
  is_late: boolean;
  left_early: boolean;
  checked_in_at_utc: string | null;
  last_valid_seen_utc: string | null;
  method: string | null;
  rank: number;
  override_note: string | null;
};

const showMsg = (m: string) =>
  Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert("", m);

export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = id ?? "";

  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [attend, setAttend] = useState<AttendRow[]>([]);
  const [finalized, setFinalized] = useState<FinalizedRow[]>([]);
  const [isAuthed, setIsAuthed] = useState(false);

  // === Geofence controls ===
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [radius, setRadius] = useState<string>("120");
  const [gfStarted, setGfStarted] = useState<boolean>(false);

  // === Edit modal ===
  const [editTarget, setEditTarget] = useState<MergedRow | null>(null);
  const [editOnTime, setEditOnTime] = useState(false);
  const [editLate, setEditLate] = useState(false);
  const [editLeftEarly, setEditLeftEarly] = useState(false);
  const [editNote, setEditNote] = useState("");

  const fetchSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setIsAuthed(!!data.session);
  }, []);

  useEffect(() => {
    fetchSession();
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_evt: AuthChangeEvent, sess: Session | null) => setIsAuthed(!!sess)
    );
    return () => sub.subscription?.unsubscribe();
  }, [fetchSession]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [{ data: st }, { data: at }, { data: fr }] = await Promise.all([
        supabase
          .from("attendance_status")
          .select("event_id,user_id,is_on_time,is_late,left_early,override_note")
          .eq("event_id", eventId),
        supabase
          .from("attendance")
          .select("event_id,user_id,checked_in_at_utc,last_valid_seen_utc,method")
          .eq("event_id", eventId)
          .order("checked_in_at_utc", { ascending: true, nullsFirst: true }),
        supabase
          .from("arrival_result")
          .select("event_id,user_id,final_rank")
          .eq("event_id", eventId)
          .order("final_rank", { ascending: true }),
      ]);
      setStatuses((st ?? []) as StatusRow[]);
      setAttend((at ?? []) as AttendRow[]);
      setFinalized((fr ?? []) as FinalizedRow[]);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Preload event coords + geofence status
  useEffect(() => {
    (async () => {
      const s = await geofenceStatus();
      setGfStarted(s.started);
      if (!eventId) return;
      const { data } = await supabase
        .from("events")
        .select("latitude,longitude,lat,lng,radius")
        .eq("id", eventId)
        .maybeSingle();
      if (data) {
        const latitude = (data as any).latitude ?? (data as any).lat;
        const longitude = (data as any).longitude ?? (data as any).lng;
        const r = (data as any).radius ?? 120;
        if (latitude != null && longitude != null) {
          setLat(String(latitude));
          setLng(String(longitude));
        }
        setRadius(String(r));
      }
    })();
  }, [eventId]);

  const usingFinalized = finalized.length > 0;

  const merged: MergedRow[] = useMemo(() => {
    const byUser = new Map<string, MergedRow>();
    for (const s of statuses) {
      byUser.set(s.user_id, {
        user_id: s.user_id,
        is_on_time: !!s.is_on_time,
        is_late: !!s.is_late,
        left_early: !!s.left_early,
        checked_in_at_utc: null,
        last_valid_seen_utc: null,
        method: null,
        rank: 0,
        override_note: s.override_note,
      });
    }
    for (const a of attend) {
      const cur = byUser.get(a.user_id) ?? {
        user_id: a.user_id,
        is_on_time: false,
        is_late: false,
        left_early: false,
        checked_in_at_utc: null,
        last_valid_seen_utc: null,
        method: null,
        rank: 0,
        override_note: null,
      };
      cur.checked_in_at_utc = a.checked_in_at_utc;
      cur.last_valid_seen_utc = a.last_valid_seen_utc;
      cur.method = a.method;
      byUser.set(a.user_id, cur);
    }
    let arr = Array.from(byUser.values());
    if (usingFinalized) {
      const order = new Map<string, number>();
      finalized.forEach((f) => order.set(f.user_id, f.final_rank));
      arr = arr.sort((l, r) => (order.get(l.user_id)! ?? 1e9) - (order.get(r.user_id)! ?? 1e9));
      arr.forEach((row) => (row.rank = order.get(row.user_id)! ?? 0));
    } else {
      arr = arr.sort((l, r) => {
        const L = l.checked_in_at_utc ? Date.parse(l.checked_in_at_utc) : Number.MAX_SAFE_INTEGER;
        const R = r.checked_in_at_utc ? Date.parse(r.checked_in_at_utc) : Number.MAX_SAFE_INTEGER;
        return L - R;
      });
      arr.forEach((row, i) => (row.rank = i + 1));
    }
    return arr;
  }, [statuses, attend, usingFinalized, finalized]);

  const totals = useMemo(
    () => ({
      total: statuses.length,
      ontime: statuses.filter((s) => s.is_on_time).length,
      late: statuses.filter((s) => s.is_late).length,
      left: statuses.filter((s) => s.left_early).length,
    }),
    [statuses]
  );

  const requireAuth = () => {
    if (!isAuthed) {
      showMsg("Sign-in required (RLS).");
      return false;
    }
    return true;
  };

  const handleFinalize = useCallback(async () => {
    if (!requireAuth() || !eventId) return;
    try {
      await supabase.from("arrival_result").delete().eq("event_id", eventId);
      const payload = merged.map((m) => ({ event_id: eventId, user_id: m.user_id, final_rank: m.rank }));
      if (payload.length) {
        const { error } = await supabase.from("arrival_result").insert(payload);
        if (error) throw error;
      }
      showMsg("Finalized.");
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to finalize.");
    }
  }, [eventId, merged, load]);

  const handleClearFinalized = useCallback(async () => {
    if (!requireAuth() || !eventId) return;
    try {
      await supabase.from("arrival_result").delete().eq("event_id", eventId);
      showMsg("Cleared finalized.");
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to clear.");
    }
  }, [eventId, load]);

  const handleRebuild = useCallback(async () => {
    if (!requireAuth() || !eventId) return;
    try {
      await supabase.from("arrival_result").delete().eq("event_id", eventId);
      await handleFinalize();
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to rebuild.");
    }
  }, [eventId, handleFinalize]);

  // ===== Geofence actions =====
  const handleArmGeofence = useCallback(async () => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const r = Math.max(25, Number(radius) || 120);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      showMsg("Invalid coords");
      return;
    }
    try {
      await armGeofenceAt({ latitude, longitude }, r);
      setGfStarted(true);
      showMsg("Geofence armed.");
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to arm geofence.");
    }
  }, [lat, lng, radius]);

  const handleDisarmGeofence = useCallback(async () => {
    try {
      await disarmGeofence();
      const s = await geofenceStatus();
      setGfStarted(s.started);
      showMsg("Geofence disarmed.");
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to disarm geofence.");
    }
  }, []);

  const openEdit = (row: MergedRow) => {
    setEditTarget(row);
    setEditOnTime(row.is_on_time);
    setEditLate(row.is_late);
    setEditLeftEarly(row.left_early);
    setEditNote(row.override_note ?? "");
  };

  const saveOverride = async () => {
    if (!requireAuth() || !editTarget) return;
    try {
      const payload = {
        event_id: eventId,
        user_id: editTarget.user_id,
        is_on_time: editOnTime,
        is_late: editLate,
        left_early: editLeftEarly,
        note: editNote || null,
      };
      const { error } = await supabase.from("attendance_override").upsert(payload as any, {
        onConflict: "event_id,user_id",
      } as any);
      if (error) throw error;
      showMsg("Saved.");
      setEditTarget(null);
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to save override.");
    }
  };

  const clearOverride = async () => {
    if (!requireAuth() || !editTarget) return;
    try {
      await supabase.from("attendance_override").delete().match({ event_id: eventId, user_id: editTarget.user_id });
      showMsg("Cleared.");
      setEditTarget(null);
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "Failed to clear override.");
    }
  };

  const renderItem = ({ item }: { item: MergedRow }) => {
    const short = item.user_id.slice(0, 6) + "…" + item.user_id.slice(-3);
    return (
      <View style={styles.row}>
        <View style={styles.rankBubble}>
          <Text style={styles.rankText}>{item.rank || "—"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>
            {short} <Text style={styles.rankHash}>#{item.rank || "?"}</Text>
          </Text>
          <Text style={styles.meta}>
            {item.checked_in_at_utc ? fmtTime(item.checked_in_at_utc) : "—"} • {item.method ?? "unknown"} • last seen{" "}
            {item.last_valid_seen_utc ? fmtTime(item.last_valid_seen_utc) : "—"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {item.is_on_time ? <Pill text="On-Time" variant="success" tone="soft" /> : null}
            {item.is_late ? <Pill text="Late" variant="warning" tone="soft" /> : null}
            {item.left_early ? <Pill text="Left Early" variant="danger" tone="soft" /> : null}
          </View>
        </View>
        <Button
          title="Edit"
          onPress={() => openEdit(item)}
          variant="primary"
          size="sm"
          style={[styles.btnSm, !isAuthed && styles.disabled]}
          disabled={!isAuthed}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>&lt; live</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push(`/organize/events/${eventId}/settings`)}>
          <Text style={styles.link}>Edit Grace Windows</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/organize/events/${eventId}/history`)}>
          <Text style={styles.link}>History</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Live — Check-in Rank</Text>
      <Text style={styles.sub}>{usingFinalized ? "Using finalized ranks" : "Using live order"}</Text>

      {/* Geofence */}
      <Card variant="elevated" style={{ marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Geofence (Venue)</Text>

        <Text style={styles.fieldLabel}>Latitude</Text>
        <TextInput
          value={lat}
          onChangeText={setLat}
          keyboardType="decimal-pad"
          placeholder="-37.9026"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Longitude</Text>
        <TextInput
          value={lng}
          onChangeText={setLng}
          keyboardType="decimal-pad"
          placeholder="145.0742"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Radius (m)</Text>
        <TextInput
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
          placeholder="120"
          style={styles.input}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Button title="Arm Geofence" onPress={handleArmGeofence} />
          <Button title="Disarm" onPress={handleDisarmGeofence} variant="danger" />
        </View>

        <Text style={{ marginTop: 8, fontWeight: "700", color: gfStarted ? COLORS.success : COLORS.textMuted }}>
          {gfStarted ? "Geofence running" : "Geofence not running"}
        </Text>
      </Card>

      {/* Tiles */}
      <View style={{ flexDirection: "row", gap: SPACING.md, marginVertical: 8, flexWrap: "wrap" }}>
        <Tile label="Total" value={totals.total} />
        <Tile label="On-time" value={totals.ontime} />
        <Tile label="Late" value={totals.late} />
        <Tile label="Left early" value={totals.left} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button title="Finalize Now" onPress={handleFinalize} disabled={!isAuthed} />
        <Button title="Clear Finalized" onPress={handleClearFinalized} variant="danger" disabled={!isAuthed} />
        <Button title="Rebuild Ranks" onPress={handleRebuild} variant="outline" disabled={!isAuthed} />
      </View>

      {/* List */}
      <FlatList
        data={merged}
        keyExtractor={(x) => x.user_id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Edit modal */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Override — {editTarget ? shortId(editTarget.user_id) : ""}</Text>

            <RowSwitch label="On-Time" value={editOnTime} onValueChange={setEditOnTime} />
            <RowSwitch label="Late" value={editLate} onValueChange={setEditLate} />
            <RowSwitch label="Left Early" value={editLeftEarly} onValueChange={setEditLeftEarly} />

            <TextInput placeholder="note (optional)" value={editNote} onChangeText={setEditNote} style={styles.note} />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <Button title="Save" onPress={saveOverride} disabled={!isAuthed} />
              <Button title="Clear Override" onPress={clearOverride} variant="danger" disabled={!isAuthed} />
              <View style={{ flex: 1 }} />
              <Button title="Close" onPress={() => setEditTarget(null)} />
            </View>
            {!isAuthed ? <Text style={styles.hint}>Sign-in required (RLS)</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RowSwitch({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.rowSwitch}>
      <Text style={styles.rowSwitchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return "—";
  }
}
const pad = (n: number) => String(n).padStart(2, "0");
const shortId = (id: string) => id.slice(0, 6) + "…" + id.slice(-3);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.lg },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 12 },
  back: { color: "#374151", fontSize: 16 },
  link: { color: "#0EA5E9", fontWeight: "700", marginLeft: 14 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 8, color: COLORS.text },
  sub: { color: COLORS.textMuted, marginBottom: 10 },

  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6, color: COLORS.text },
  fieldLabel: { color: COLORS.text, marginTop: 6, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    backgroundColor: COLORS.cardBg,
  },

  actions: { flexDirection: "row", gap: SPACING.md, marginVertical: 8, flexWrap: "wrap" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  rankBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontWeight: "800", color: COLORS.text },
  name: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  rankHash: { color: COLORS.textSubtle, fontSize: 14 },
  meta: { color: COLORS.textMuted, marginTop: 2 },

  btnSm: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  disabled: { opacity: 0.45 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  modalCard: {
    width: "92%",
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10, color: COLORS.text },
  rowSwitch: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  rowSwitchLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  note: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    backgroundColor: COLORS.cardBg,
  },
  hint: { color: COLORS.textSubtle, marginTop: 8, textAlign: "right" },
});
