import { useCallback } from "react";
import { Pressable, Text, View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useDevRoleStore,
  useEffectiveRole,
  devSwitchEnabled,
  type Role,
} from "../stores/devRole";

const enableDev = devSwitchEnabled();

export default function DevRoleBadge() {
  const insets = useSafeAreaInsets();
  const role = useEffectiveRole();
  const setRoleOverride = useDevRoleStore((s) => s.setRoleOverride);

  const top = Math.max(insets.top, 8) + 8;
  const right = Math.max(insets.right, 8) + 8;

  const toggle = useCallback(async () => {
    if (!enableDev) return;
    const next: Role = role === "organizer" ? "attendee" : "organizer";
    console.log("[DevRoleBadge] toggle pressed. current:", role, "next:", next);
    try {
      await setRoleOverride(next);
    } catch (e) {
      console.log("[DevRoleBadge] setRoleOverride failed:", String(e));
    }
  }, [role, setRoleOverride]);

  console.log("[DevRoleBadge] render. role =", role, "enableDev =", enableDev);

  if (!enableDev) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top, right }]}>
      <Pressable
        onPress={toggle}
        style={styles.badge}
        hitSlop={{ top: 18, bottom: 18, left: 18, right: 18 }}
        android_ripple={{ color: "#00000022", borderless: true }}
        accessibilityRole="button"
      >
        <Text style={styles.text}>DEV ROLE: {role.toUpperCase()}</Text>
        <Text style={styles.hint}>
          {Platform.OS === "web" ? "click to toggle" : "tap to toggle"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 9999 },
  badge: {
    backgroundColor: "#FFE082",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    elevation: 8,
  },
  text: { fontWeight: "700", color: "#111827" },
  hint: { fontSize: 10, color: "#374151" },
});
