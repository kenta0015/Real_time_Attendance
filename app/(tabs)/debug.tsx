// app/(tabs)/debug.tsx
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  DeviceEventEmitter,
  FlatList,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useDevRoleStore,
  devSwitchEnabled,
  restoreDevRoleOverride,
  useEffectiveRole,
  type Role,
} from "../../stores/devRole";

// Common UI
import Card from "../ui/Card";
import Button from "../ui/Button";
import Pill from "../ui/Pill";
import { COLORS, SPACING } from "@ui/theme";

// in-app logger
import { EMIT_EVT, getBufferedLogs } from "../../lib/logger";

type LogEntry = {
  t: number;
  level: "log" | "info" | "warn" | "error";
  msg: string;
};

export default function DebugDevPanel() {
  const router = useRouter();
  const enabled = devSwitchEnabled();

  const serverRole = useDevRoleStore((s) => s.serverRole);
  const roleOverride = useDevRoleStore((s) => s.roleOverride);
  const setRoleOverride = useDevRoleStore((s) => s.setRoleOverride);
  const clearOverride = useDevRoleStore((s) => s.clearOverride);
  const effectiveRole = useEffectiveRole();

  const [restored, setRestored] = useState(false);

  // logs
  const [logs, setLogs] = useState<LogEntry[]>(getBufferedLogs() as any);
  const [levelFilter, setLevelFilter] = useState<"all" | LogEntry["level"]>("all");

  // --- Hooks must be declared before any conditional return ---
  const apply = useCallback(
    async (role: Role) => {
      await setRoleOverride(role);
      console.log("[DEV ROLE] setRoleOverride:", role);
      console.log("[DEV ROLE] now ->", {
        serverRole,
        roleOverride: useDevRoleStore.getState().roleOverride,
      });
    },
    [setRoleOverride, serverRole]
  );

  const forceToggleNoPersist = useCallback(() => {
    const cur = useDevRoleStore.getState().roleOverride;
    const next: Role = cur === "organizer" ? "attendee" : "organizer";
    useDevRoleStore.setState({ roleOverride: next });
    console.log("[DEV ROLE] forceToggleNoPersist:", { from: cur, to: next });
  }, []);

  const pingLog = useCallback(() => {
    console.log("[DEV ROLE] snapshot", {
      __DEV__,
      devSwitch: enabled,
      serverRole,
      roleOverride,
      effectiveRole,
      env: process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH,
    });
  }, [enabled, serverRole, roleOverride, effectiveRole]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await restoreDevRoleOverride();
      if (mounted) setRestored(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Defer state updates to the next frame to avoid "update while rendering other component"
    let rafId: number | null = null;
    const sub = DeviceEventEmitter.addListener(EMIT_EVT, () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        setLogs(getBufferedLogs() as any);
        rafId = null;
      });
    });
    return () => {
      sub.remove();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  const filtered = useMemo(() => {
    if (levelFilter === "all") return logs;
    return logs.filter((l) => l.level === levelFilter);
  }, [logs, levelFilter]);

  if (!enabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>404 — Dev Panel disabled</Text>
        <View style={{ marginTop: SPACING.md }}>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (!restored) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading Dev Panel…</Text>
      </View>
    );
  }

  const renderLog = ({ item }: { item: LogEntry }) => {
    const time = new Date(item.t).toLocaleTimeString();
    const color =
      item.level === "error"
        ? "#ef4444"
        : item.level === "warn"
        ? "#f59e0b"
        : item.level === "info"
        ? "#2563eb"
        : COLORS.text;
    return (
      <View style={styles.logRow}>
        <Text style={styles.logTime}>{time}</Text>
        <Text style={[styles.logLevel, { color }]}>{item.level.toUpperCase()}</Text>
        <Text style={styles.logMsg} numberOfLines={4}>
          {item.msg}
        </Text>
      </View>
    );
  };

  const LevelButton = ({ val, label }: { val: "all" | LogEntry["level"]; label: string }) => {
    const active = levelFilter === val;
    return (
      <Pressable
        onPress={() => setLevelFilter(val)}
        style={[
          styles.filterBtn,
          active && { backgroundColor: "#111827", borderColor: "#111827" },
        ]}
      >
        <Text style={[styles.filterBtnText, active && { color: "white", fontWeight: "800" }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Dev Panel</Text>

      <Card>
        <View style={{ gap: 6 }}>
          <Text style={styles.kv}>
            Dev Switch: <Text style={styles.bold}>{enabled ? "ENABLED" : "disabled"}</Text>
          </Text>
          <Text style={styles.kv}>
            Effective Role:{" "}
            <Pill text={effectiveRole.toUpperCase()} variant="info" tone="filled" />
          </Text>
          <Text style={styles.kv}>
            Override: <Text style={styles.bold}>{roleOverride ?? "(none)"}</Text>
          </Text>
          <Text style={styles.kv}>
            ServerRole: <Text style={styles.bold}>{serverRole ?? "(null)"}</Text>
          </Text>
          <Text style={styles.kv}>
            ENV EXPO_PUBLIC_ENABLE_DEV_SWITCH:{" "}
            <Text style={styles.bold}>{String(process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH)}</Text>
          </Text>
        </View>
      </Card>

      <View style={styles.row}>
        <Button title="Set Attendee" onPress={() => apply("attendee")} />
        <Button title="Set Organizer" onPress={() => apply("organizer")} />
      </View>

      <Button title="Clear Override" onPress={() => clearOverride()} variant="outline" />

      <View style={styles.row}>
        <Button title="Force Toggle (no persist)" onPress={forceToggleNoPersist} variant="outline" />
        <Button title="Ping Log" onPress={pingLog} variant="outline" />
      </View>

      {/* in-app log viewer */}
      <Card style={{ marginTop: SPACING.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Text style={styles.h2}>In-App Logs</Text>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <LevelButton val="all" label="ALL" />
            <LevelButton val="info" label="INFO" />
            <LevelButton val="warn" label="WARN" />
            <LevelButton val="error" label="ERROR" />
          </View>
        </View>

        <FlatList
          data={filtered.slice().reverse()}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderLog}
          style={{ maxHeight: 320 }}
          contentContainerStyle={{ paddingBottom: 6 }}
          initialNumToRender={20}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg, gap: SPACING.md, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  kv: { color: COLORS.text, fontSize: 16 },
  bold: { fontWeight: "800", color: COLORS.text },
  row: { flexDirection: "row", gap: SPACING.md, marginTop: 4 },
  muted: { color: COLORS.textMuted },

  // Logs
  logRow: { flexDirection: "row", gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logTime: { width: 74, color: COLORS.textSubtle },
  logLevel: { width: 64, fontWeight: "800" },
  logMsg: { flex: 1, color: COLORS.text },
  filterBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "white",
  },
  filterBtnText: { color: "#111827", fontWeight: "600" },
});



