import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, ToastAndroid, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getGuestId } from "../../../stores/session";
import Button from "../../ui/Button";
import { supabase } from "../../../lib/supabase";
import { useEffectiveRole, devSwitchEnabled } from "../../../stores/devRole";

const enableDev = devSwitchEnabled();

export default function ProfileScreen() {
  const [guestId, setGuestId] = useState<string>("(loading…)");
  const [signingOut, setSigningOut] = useState(false);
  const role = useEffectiveRole();

  const notify = (m: string) =>
    Platform.OS === "android" ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert("Info", m);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      notify("Signed out");
    } catch (e: any) {
      notify(e?.message ?? "Sign out failed");
    } finally {
      setSigningOut(false);
    }
  };

  const loadGuestId = useCallback(async () => {
    const id = await getGuestId();
    setGuestId(id);
  }, []);

  useEffect(() => {
    loadGuestId();
  }, [loadGuestId]);

  useFocusEffect(
    useCallback(() => {
      loadGuestId();
    }, [loadGuestId])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Current role</Text>
        <Text style={styles.value}>{role.toUpperCase()}</Text>
        <Text style={styles.hint}>
          {enableDev
            ? "Toggle via the yellow DEV ROLE badge."
            : "Role is determined by your account on the server."}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Guest ID</Text>
        <Text style={styles.mono}>{guestId}</Text>
        <Text style={styles.hint}>Stored locally. Resetting app data will change this value.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.hint}>Sign out to switch account or return to guest mode.</Text>
        <Button
          title={signingOut ? "Signing out…" : "Sign out"}
          onPress={handleSignOut}
          disabled={signingOut}
          style={styles.logoutButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  label: { fontWeight: "700", marginBottom: 6 },
  value: { fontSize: 18, fontWeight: "800" },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    color: "#111827",
  },
  hint: { color: "#6B7280", marginTop: 6, fontSize: 12 },
  logoutButton: { marginTop: 8, alignSelf: "flex-start" },
});
