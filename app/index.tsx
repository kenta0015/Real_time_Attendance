// app/index.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useDevRoleStore } from "../stores/devRole";
import { bootstrapUserAndRole } from "../lib/bootstrapUserAndRole";

export default function Index() {
  const router = useRouter();
  const setServerRole = useDevRoleStore((s) => s.setServerRole);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await bootstrapUserAndRole({
        router,
        setServerRole,
        isCancelled: () => cancelled,
      });

      if (!cancelled) {
        setBooting(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router, setServerRole]);

  if (!booting) {
    // This screen immediately redirects; no actual UI once boot is done.
    return null;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
