import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  useDevRoleStore,
  devSwitchEnabled,
  restoreDevRoleOverride,
  useEffectiveRole,
  type Role,
} from "../../stores/devRole";

export default function DebugDevPanel() {
  const router = useRouter();
  const enabled = devSwitchEnabled();

  const serverRole = useDevRoleStore((s) => s.serverRole);
  const roleOverride = useDevRoleStore((s) => s.roleOverride);
  const setRoleOverride = useDevRoleStore((s) => s.setRoleOverride);
  const clearOverride = useDevRoleStore((s) => s.clearOverride);
  const effectiveRole = useEffectiveRole();

  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await restoreDevRoleOverride();
      if (mounted) setRestored(true);
    })();
    return () => { mounted = false; };
  }, []);

  if (!enabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>404 — Dev Panel disabled</Text>
        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Go Back</Text>
        </Pressable>
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

  const apply = async (role: Role) => {
    await setRoleOverride(role);
    console.log("[DEV ROLE] setRoleOverride:", role);
    console.log("[DEV ROLE] now ->", {
      serverRole,
      roleOverride: useDevRoleStore.getState().roleOverride,
    });
  };

  const forceToggleNoPersist = () => {
    const cur = useDevRoleStore.getState().roleOverride;
    const next: Role = cur === "organizer" ? "attendee" : "organizer";
    useDevRoleStore.setState({ roleOverride: next });
    console.log("[DEV ROLE] forceToggleNoPersist:", { from: cur, to: next });
  };

  const pingLog = () => {
    console.log("[DEV ROLE] snapshot", {
      __DEV__,
      devSwitch: enabled,
      serverRole,
      roleOverride,
      effectiveRole,
      env: process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Dev Panel</Text>

      <View style={styles.box}>
        <Text style={styles.kv}>
          Dev Switch: <Text style={styles.bold}>{enabled ? "ENABLED" : "disabled"}</Text>
        </Text>
        <Text style={styles.kv}>
          Effective Role: <Text style={styles.badge}>{effectiveRole.toUpperCase()}</Text>
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

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.primary]} onPress={() => apply("attendee")}>
          <Text style={styles.btnText}>Set Attendee</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.primary]} onPress={() => apply("organizer")}>
          <Text style={styles.btnText}>Set Organizer</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.btn, styles.outline]} onPress={() => clearOverride()}>
        <Text style={styles.outlineText}>Clear Override</Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.secondary]} onPress={forceToggleNoPersist}>
          <Text style={styles.btnText}>Force Toggle (no persist)</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.secondary]} onPress={pingLog}>
          <Text style={styles.btnText}>Ping Log</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12, backgroundColor: "#0b0b0b" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0b" },
  h1: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 8 },
  box: { borderWidth: 1, borderColor: "#333", borderRadius: 10, padding: 12, gap: 6 },
  kv: { color: "#ddd", fontSize: 16 },
  bold: { fontWeight: "700", color: "#fff" },
  badge: {
    fontWeight: "800",
    color: "#111",
    backgroundColor: "#a7f3d0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
  },
  primary: { backgroundColor: "#2563eb" },
  secondary: { backgroundColor: "#374151" },
  outline: { borderWidth: 1, borderColor: "#666" },
  outlineText: { color: "#ddd", fontWeight: "700" },
  btnText: { color: "#fff", fontWeight: "700" },
  muted: { color: "#9ca3af" },
});
