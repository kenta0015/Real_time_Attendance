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
    const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
    setRole(v === "attendee" ? "attendee" : "organizer");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const emitRoleChanged = (next: Role) => {
    // Native event only（WebでもRN実装があるのでOK）
    try {
      DeviceEventEmitter.emit("rta_role_changed", next);
    } catch {}
  };

  const toggle = useCallback(async () => {
    const next: Role = role === "organizer" ? "attendee" : "organizer";
    await AsyncStorage.setItem(ROLE_KEY, next);
    setRole(next);
    emitRoleChanged(next);
  }, [role]);

  const top = Math.max(insets.top, 8) + 8;
  const right = Math.max(insets.right, 8) + 8;

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
