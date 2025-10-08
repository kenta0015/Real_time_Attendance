// app/join.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load session + subscribe auth state
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) setSessionUserId(data.session?.user?.id ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSessionUserId(sess?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    if (!email || !password) return Alert.alert("Sign in", "Email and password are required.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      Alert.alert("Signed in", "You are now signed in.");
      // Navigate to location-test quickly if needed
      // router.replace("/organize/location-test");
    } catch (e: any) {
      Alert.alert("Sign in failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    if (!email || !password) return Alert.alert("Sign up", "Email and password are required.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      Alert.alert("Sign up", "Check your email to verify your account (if email confirmation is enabled).");
    } catch (e: any) {
      Alert.alert("Sign up failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function magicLink() {
    if (!email) return Alert.alert("Magic link", "Email is required.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      Alert.alert("Magic link sent", "Check your inbox.");
    } catch (e: any) {
      Alert.alert("Magic link failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      Alert.alert("Signed out", "You are now signed out.");
    } catch (e: any) {
      Alert.alert("Sign out failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // Keep existing “Join with token” behavior (placeholder)
  function joinWithToken() {
    const token = (params?.token as string) || "(none)";
    Alert.alert("Join (placeholder)", `token=${token}`);
    // If you later support token join:
    // supabase.rpc('join_with_token', { p_token: token })
    //   .then(({ error }) => error ? Alert.alert("Join failed", error.message) : Alert.alert("Joined", "Success"));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in to continue</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          style={styles.input}
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          style={styles.input}
        />
      </View>

      <View style={styles.buttons}>
        <Button title={loading ? "Signing in..." : "Sign In"} onPress={signIn} disabled={loading} />
        <Button title="Sign Up" onPress={signUp} disabled={loading} />
        <Button title="Send Magic Link" onPress={magicLink} disabled={loading} />
      </View>

      <View style={[styles.row, { marginTop: 16 }]}>
        <Text style={styles.label}>Session</Text>
        <Text style={styles.value}>
          {sessionUserId ? sessionUserId : "Not signed in"}
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button title="Sign Out" onPress={signOut} disabled={loading} />
        <Button title="Open Location Test" onPress={() => router.push("/organize/location-test")} />
      </View>

      <View style={[styles.sep]} />

      <Text style={styles.subtitle}>Legacy</Text>
      <View style={styles.buttons}>
        <Button title="Join with token" onPress={joinWithToken} />
      </View>

      <Text style={styles.note}>
        • Make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.
      </Text>
      <Text style={styles.note}>
        • On Android, prefer a Dev Client build for background geofencing and local notifications.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  row: { gap: 6 },
  label: { color: "#444", fontWeight: "600" },
  value: { color: "#111", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 12, android: 8, default: 8 }),
  },
  buttons: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  sep: { height: 1, backgroundColor: "#eee", marginVertical: 8 },
  note: { color: "#0a7ea4" },
});
