// app/(tabs)/debug.tsx
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
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
import { COLORS, SPACING } from "../ui/theme";

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
    return () => {
      mounted = false;
    };
  }, []);

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg, gap: SPACING.md, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  kv: { color: COLORS.text, fontSize: 16 },
  bold: { fontWeight: "800", color: COLORS.text },
  row: { flexDirection: "row", gap: SPACING.md, marginTop: 4 },
  muted: { color: COLORS.textMuted },
});
