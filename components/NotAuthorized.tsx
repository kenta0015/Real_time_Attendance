import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function NotAuthorized({ message = "You don't have permission to view this content." }: { message?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Not authorized</Text>
      <Text style={styles.desc}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0b0b0b" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  desc: { color: "#cbd5e1", fontSize: 14, textAlign: "center" },
});




