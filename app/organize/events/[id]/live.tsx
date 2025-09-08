import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View, Button } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../lib/supabase";

type RowBase = {
  event_id: string;
  user_id: string;
  method: string | null;
  checked_in_at_utc: string;
  comment?: string | null;
};
type LiveItem = RowBase & { rank: number; gpsRank?: number; medal?: "🥇" | "🥈" | "🥉" };

const AWAY_MS = 3 * 60 * 1000;

export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [rows, setRows] = useState<LiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFinalized, setUsingFinalized] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- time helpers ----
  const fmtTime = (v: unknown): string => {
    if (!v) return "";
    let s = String(v).trim();
    if (!s) return "";
    s = s.replace(" ", "T");
    s = s.replace(/(\.\d{3})\d+/, "$1");
    if (/[+-]\d{2}\d{2}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    else if (/[+-]\d{2}$/.test(s)) s = s + ":00";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString();
  };
  const isAway = (ts: string) => {
    let s = ts.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
    if (/[+-]\d{2}\d{2}$/.test(s)) s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    else if (/[+-]\d{2}$/.test(s)) s = s + ":00";
    const t = new Date(s).getTime();
    return Number.isFinite(t) && Date.now() - t > AWAY_MS;
  };

  const computeMedals = (list: LiveItem[]) => {
    let g = 0;
    return list.map((r) => {
      if (r.method === "gps") {
        g += 1;
        if (g === 1) return { ...r, gpsRank: 1, medal: "🥇" as const };
        if (g === 2) return { ...r, gpsRank: 2, medal: "🥈" as const };
        if (g === 3) return { ...r, gpsRank: 3, medal: "🥉" as const };
        return { ...r, gpsRank: g };
      }
      return r;
    });
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setStatusMsg(null);

    const countRes = await supabase
      .from("arrival_result")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", id as any);

    const hasFinal = (countRes.count ?? 0) > 0;
    if (countRes.error) setStatusMsg(`finalized count err: ${countRes.error.message}`);

    if (hasFinal) {
      const fin = await supabase
        .from("arrival_result")
        .select("event_id,user_id,method,checked_in_at_utc,final_rank")
        .eq("event_id", id as any)
        .order("final_rank", { ascending: true });

      if (!fin.error && fin.data && fin.data.length > 0) {
        const list: LiveItem[] = fin.data.map((r: any) => ({
          event_id: r.event_id,
          user_id: r.user_id,
          method: r.method,
          checked_in_at_utc: r.checked_in_at_utc,
          rank: r.final_rank,
        }));
        setRows(computeMedals(list));
        setUsingFinalized(true);
        setLoading(false);
        return;
      } else {
        setStatusMsg(`finalized read err: ${fin.error?.message ?? "no data"}`);
      }
    }

    const att = await supabase
      .from("attendance")
      .select("event_id,user_id,checked_in_at_utc,method,comment")
      .eq("event_id", id as any)
      .order("checked_in_at_utc", { ascending: true });

    const list: LiveItem[] = (att.data ?? []).map((r: any, idx: number) => ({
      event_id: r.event_id,
      user_id: r.user_id,
      method: r.method,
      checked_in_at_utc: r.checked_in_at_utc,
      comment: r.comment,
      rank: idx + 1,
    }));

    setRows(computeMedals(list));
    setUsingFinalized(false);
    if (att.error) setStatusMsg(`live read err: ${att.error.message}`);
    setLoading(false);
  }, [id]);

  // realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`live-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `event_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "arrival_result", filter: `event_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { try { ch.unsubscribe(); } catch {} };
  }, [id, load]);

  // periodic rerender for AWAY
  useEffect(() => {
    refreshTimer.current && clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => setRows((prev) => [...prev]), 15 * 1000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, []);

  useEffect(() => { load(); }, [load]);

  const finalizeNow = useCallback(async () => {
    if (!id || busy) return;
    Alert.alert("Finalize rankings?", "This will snapshot current results.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Finalize",
        onPress: async () => {
          try {
            setBusy(true);
            const { error } = await supabase.rpc("finalize_arrival", { p_event_id: id as any });
            if (error) throw error;
            setStatusMsg("finalized ✓");
            await load();
          } catch (e: any) {
            setStatusMsg(`finalize err: ${e?.message ?? e}`);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [id, busy, load]);

  const clearFinalized = useCallback(async () => {
    if (!id || busy) return;
    Alert.alert("Clear finalized?", "Back to live order.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        onPress: async () => {
          try {
            setBusy(true);
            const { error } = await supabase.from("arrival_result").delete().eq("event_id", id as any);
            if (error) throw error;
            setStatusMsg("cleared ✓");
            await load();
          } catch (e: any) {
            setStatusMsg(`clear err: ${e?.message ?? e}`);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [id, busy, load]);

  const header = useMemo(
    () => (
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
        <Text style={styles.title}>Live — Check-in Rank</Text>
        <Text style={styles.caption}>
          {usingFinalized ? "Using finalized ranks" : "Using live order"}
          {statusMsg ? ` • ${statusMsg}` : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {!usingFinalized ? (
            <Button title={busy ? "Working…" : "Finalize now"} onPress={finalizeNow} disabled={busy} />
          ) : (
            <Button title={busy ? "Working…" : "Rebuild ranks"} onPress={finalizeNow} disabled={busy} />
          )}
          {usingFinalized ? <Button title="Clear finalized" onPress={clearFinalized} disabled={busy} /> : null}
        </View>
      </View>
    ),
    [usingFinalized, statusMsg, busy, finalizeNow, clearFinalized]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.dim}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(x) => `${x.event_id}-${x.user_id}-${x.checked_in_at_utc}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => <RowView item={item} fmtTime={fmtTime} isAway={isAway} />}
        ListEmptyComponent={<View style={[styles.center, { paddingVertical: 24 }]}><Text style={styles.dim}>No arrivals yet.</Text></View>}
      />
    </View>
  );
}

function RowView({ item, fmtTime, isAway }: { item: LiveItem; fmtTime: (v: unknown) => string; isAway: (ts: string) => boolean; }) {
  const away = isAway(item.checked_in_at_utc);
  return (
    <View style={styles.row}>
      <View style={styles.badge}><Text style={styles.badgeText}>{item.rank}</Text></View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {item.medal ? <Text style={styles.medal}>{item.medal}</Text> : <View style={{ width: 18 }} />}
          <Text style={styles.uid}>{short(item.user_id)}</Text>
          <Text style={styles.pos}>#{item.rank}</Text>
          {away ? <Text style={styles.away}>AWAY</Text> : null}
        </View>
        <Text style={styles.meta}>
          {fmtTime(item.checked_in_at_utc)} • {item.method ?? "—"}
          {item.comment ? ` • "${item.comment}"` : ""}
        </Text>
      </View>
    </View>
  );
}

function short(id?: string) {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  dim: { color: "#6B7280" },
  title: { fontSize: 20, fontWeight: "800" },
  caption: { color: "#6B7280", marginTop: 2 },
  sep: { height: 1, backgroundColor: "#eee", marginLeft: 72 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  uid: { fontSize: 16, fontWeight: "800", color: "#111827" },
  pos: { fontSize: 14, color: "#6B7280", marginLeft: 6 },
  meta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  badge: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 16, fontWeight: "800", color: "#111827" },
  away: { marginLeft: 8, fontSize: 16, fontWeight: "900", color: "#6B7280" },
  medal: { width: 18, textAlign: "center", fontSize: 18 },
});
