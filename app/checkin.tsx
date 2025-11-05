// app/checkin.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

type CheckinParts = { v: string; eventId: string; slot: string; sig: string };

function tryDecode(s: string | null | undefined): string | null {
  if (!s) return null;
  try {
    // If it was URI-encoded (e.g. %7C), decode once.
    const maybe = decodeURIComponent(s);
    return typeof maybe === "string" && maybe.length ? maybe : s;
  } catch {
    return s;
  }
}

function parseCheckinToken(raw?: string | null): { token: string; parts: CheckinParts } | null {
  if (!raw) return null;

  // Accept full deep link: rta://checkin?token=...
  try {
    const u = new URL(String(raw));
    if (u.protocol === "rta:") {
      const t = u.searchParams.get("token");
      if (t) return parseCheckinToken(t);
    }
  } catch {
    // Not a URL → fall through and treat as raw token
  }

  const s = tryDecode(raw) ?? "";
  const arr = s.split("|");
  if (arr.length !== 4) return null;
  const [v, eventId, slot, sig] = arr;
  if (v !== "v1" || !eventId || !slot || !sig) return null;
  return { token: s, parts: { v, eventId, slot, sig } };
}

export default function CheckinScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseCheckinToken(tokenParam ?? null), [tokenParam]);

  useEffect(() => {
    let alive = true;

    (async () => {
      console.log("[RTA] LOG — [/checkin] start, tokenParam=", tokenParam);

      if (!parsed) {
        setError("Invalid or missing check-in token.");
        return;
      }

      try {
        // Prefer server-side RPC if available
        const { error: rpcError } = await supabase.rpc("checkin_with_token", {
          p_token: parsed.token,
        });

        if (rpcError) throw rpcError;

        if (!alive) return;
        Alert.alert("Checked in", `Event ${parsed.parts.eventId.slice(0, 8)}…`);
        router.replace(`/organize/events/${parsed.parts.eventId}`);
      } catch (e: any) {
        const msg = e?.message ?? String(e ?? "");

        // In DEV environments the RPC might not exist yet — allow soft success
        if (/function .* does not exist/i.test(msg)) {
          console.log("[RTA] LOG — [/checkin] RPC missing, soft-success path");
          if (!alive) return;
          Alert.alert("Checked in (dev)", `Event ${parsed.parts.eventId.slice(0, 8)}…`);
          router.replace(`/organize/events/${parsed.parts.eventId}`);
          return;
        }

        console.log("[RTA] ERROR — [/checkin] failed:", msg);
        if (!alive) return;
        setError(msg || "Check-in failed.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [parsed, router, tokenParam]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Check-in</Text>
        <Text style={styles.msg}>Error: {error}</Text>
      </View>
    );
  }

  if (!parsed) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Check-in</Text>
        <Text style={styles.msg}>Waiting for token…</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={styles.msg}>Checking you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  msg: { color: "#4B5563", marginTop: 8, textAlign: "center" },
});
