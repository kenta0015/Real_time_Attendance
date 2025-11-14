// app/organize/admin/[eventId]/live.tsx
import React, { useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function LegacyLiveRedirect() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();

  useEffect(() => {
    const id = (eventId ?? "").toString();
    if (id && id !== "undefined") {
      router.replace(`/organize/events/${id}/live`);
    } else {
      router.replace("/organize");
    }
  }, [eventId, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.label}>Redirecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  label: { marginTop: 12, fontSize: 16, color: "#444" },
});


