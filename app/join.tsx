// app/join.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";

type TokenParts = {
  v: string;
  eventId: string;
  userId: string;
  slot: string; // keep as string for faithful rebuild
  hash: string;
};

function parseToken(raw?: string | null): TokenParts | null {
  if (!raw) return null;
  const parts = String(raw).split("|");
  if (parts.length !== 5) return null;
  const [v, eventId, userId, slot, hash] = parts;
  if (!v || !eventId || !userId || !slot || !hash) return null;
  return { v, eventId, userId, slot, hash };
}

async function rebuildIfDevUser(parts: TokenParts, sessionUserId: string | null) {
  // Only rewrite when 3rd field is literally "DEV"
  if (parts.userId !== "DEV") return { token: `v1|${parts.eventId}|${parts.userId}|${parts.slot}|${parts.hash}`, usedUserId: parts.userId, rewritten: false };

  if (!sessionUserId) throw new Error("Not signed in. Please sign in first to use DEV token.");

  const secret = process.env.EXPO_PUBLIC_QR_SECRET ?? "";
  if (!secret) throw new Error("Missing EXPO_PUBLIC_QR_SECRET in .env");

  // signature := sha256("eventId|userId|slot|secret")
  const payload = `${parts.eventId}|${sessionUserId}|${parts.slot}|${secret}`;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
  const token = `v1|${parts.eventId}|${sessionUserId}|${parts.slot}|${digest}`;
  return { token, usedUserId: sessionUserId, rewritten: true };
}

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

  // --- core join with token (supports DEV placeholder) ---
  const tokenInUrl = useMemo(() => (params?.token ? String(params.token) : null), [params?.token]);

  async function processJoinWithToken(source: "url" | "input", raw?: string) {
    try {
      setLoading(true);

      const rawToken = source === "url" ? tokenInUrl : raw;
      const parts = parseToken(rawToken);
      if (!parts || parts.v !== "v1") {
        throw new Error("Invalid token format.");
      }

      const { token, usedUserId, rewritten } = await rebuildIfDevUser(parts, sessionUserId);

      // Optional: call server-side RPC if available
      try {
        const { error } = await supabase.rpc("join_with_token", { p_token: token });
        if (error) throw error;
      } catch (e: any) {
        // If RPC is not set up, fallback to client-side UX only
        const msg = e?.message ?? String(e ?? "");
        if (!/function .* does not exist/i.test(msg)) {
          // real server error
          throw new Error(msg);
        }
      }

      Alert.alert(
        "Joined",
        `${rewritten ? "DEV token rewritten" : "Token accepted"}\nuserId=${usedUserId.slice(0, 8)}…`
      );

      // Navigate to event detail if route exists
      router.replace(`/organize/events/${parts.eventId}`);
    } catch (e: any) {
      Alert.alert("Join failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-handle when opened via rta://join?token=...
  useEffect(() => {
    if (tokenInUrl) {
      // Fire and forget; UI will still render
      processJoinWithToken("url").catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInUrl]);

  // --- auth helpers ---
  async function signIn() {
    if (!email || !password) return Alert.alert("Sign in", "Email and password are required.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      Alert.alert("Signed in", "You are now signed in.");
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
      Alert.alert("Sign up", "Check your email to verify your account.");
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

  // Manual button (still kept)
  function joinWithToken() {
    processJoinWithToken("url");
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

      <Text style={styles.subtitle}>Join via Token</Text>
      <View style={styles.buttons}>
        <Button title={loading ? "Processing..." : "Join with token"} onPress={joinWithToken} disabled={loading} />
      </View>

      <Text style={styles.note}>
        • Token URL param is auto-processed when opening rta://join?token=...
      </Text>
      <Text style={styles.note}>
        • DEV token is supported: it will be rewritten with your signed-in userId and re-signed.
      </Text>
      <Text style={styles.note}>
        • Make sure EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / EXPO_PUBLIC_QR_SECRET are set.
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
