import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Link, useRouter } from "expo-router";

// 常時出す緊急用（直ったら import を外せば消える）
export default function DebugFAB() {
  const router = useRouter();
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Link href="/_debug" asChild>
        <Pressable
          onPress={() => router.push("/_debug")}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.txt}>/_debug</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 24,
    right: 16,
    zIndex: 99998,
    pointerEvents: "box-none",
  },
  fab: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    elevation: 14,
  },
  txt: { color: "#fff", fontWeight: "800" },
});




