import React from "react";
import { Stack } from "expo-router";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useIsOrganizer } from "../../../../stores/devRole";

export default function AdminLayout() {
  const ok = useIsOrganizer();

  if (!ok) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Not authorized</Text>
        <Text style={styles.desc}>Organizer role is required to view admin screens.</Text>
        <Text style={styles.hint}>Open /_debug and switch role, then come back.</Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0b0b0b" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  desc: { color: "#cbd5e1", fontSize: 14, marginBottom: 6, textAlign: "center" },
  hint: { color: "#94a3b8", fontSize: 13, textAlign: "center" },
});




