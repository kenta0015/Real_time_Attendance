// app/checkin.tsx
import React, { useEffect, useMemo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

/**
 * Permanent redirect:
 *   /checkin?token=...  -->  /attend/checkin?token=...
 * Pass through all existing query params as-is.
 */
export default function CheckinRedirect() {
  const rawParams = useLocalSearchParams<Record<string, string | string[]>>();

  // Normalize params to primitive string values (take the first item if array)
  const params = useMemo(() => {
    const p: Record<string, string> = {};
    Object.entries(rawParams ?? {}).forEach(([k, v]) => {
      if (v == null) return;
      p[k] = Array.isArray(v) ? String(v[0]) : String(v);
    });
    return p;
  }, [rawParams]);

  useEffect(() => {
    // Replace so back button doesn't return to the legacy route
    router.replace({ pathname: "/attend/checkin", params });
  }, [params]);

  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.text}>Redirecting to check-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  text: { marginTop: 10, color: "#444", fontWeight: "600" },
});
