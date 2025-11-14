import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  DeviceEventEmitter,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Role = "organizer" | "attendee";
const ROLE_KEY = "rta_dev_role";

export default function DevRoleBadge() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>("organizer");

  const load = useCallback(async () => {
    try {
      const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
      const normalized: Role = v === "attendee" ? "attendee" : "organizer";
      console.log(
        "[DevRoleBadge] load() from AsyncStorage:",
        v,
        "=> normalized:",
        normalized
      );
      setRole(normalized);
    } catch (e) {
      console.log("[DevRoleBadge] load() failed:", String(e));
      setRole("organizer");
    }
  }, []);

  useEffect(() => {
    console.log("[DevRoleBadge] mount");
    load();
  }, [load]);

  const emitRoleChanged = (next: Role) => {
    try {
      console.log("[DevRoleBadge] emit rta_role_changed:", next);
      DeviceEventEmitter.emit("rta_role_changed", next);
    } catch (e) {
      console.log("[DevRoleBadge] emit failed:", String(e));
    }
  };

  const toggle = useCallback(async () => {
    const next: Role = role === "organizer" ? "attendee" : "organizer";
    console.log("[DevRoleBadge] toggle pressed. current:", role, "next:", next);
    try {
      await AsyncStorage.setItem(ROLE_KEY, next);
      console.log("[DevRoleBadge] AsyncStorage set:", ROLE_KEY, "=", next);
    } catch (e) {
      console.log("[DevRoleBadge] AsyncStorage.setItem failed:", String(e));
    }
    setRole(next);
    emitRoleChanged(next);
  }, [role]);

  const top = Math.max(insets.top, 8) + 8;
  const right = Math.max(insets.right, 8) + 8;

  console.log("[DevRoleBadge] render. role =", role);

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
