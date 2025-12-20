// app/attend/checkin.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";

type RpcOk = unknown;

function tryDecodeOnce(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Robust token normalizer:
 * - trims quotes/whitespaces/newlines
 * - extracts token=... if a URL or query-like string is passed
 * - repeatedly decodes (%257C → %7C → |)
 * - removes accidental spaces around '|'
 */
function normalizeToken(input: string | string[] | undefined): string | null {
  if (!input) return null;
  let t = Array.isArray(input) ? input[0] : input;
  if (!t) return null;

  // strip whitespace, quotes, and newlines
  t = String(t).trim().replace(/^"(.*)"$/s, "$1").replace(/^\s+|\s+$/g, "").replace(/\r?\n/g, "");

  // If the whole thing looks like a URL, extract ?token=
  if (/^(https?:\/\/|rta:\/\/)/i.test(t)) {
    try {
      const u = new URL(t);
      const q = u.searchParams.get("token");
      if (q) t = q;
    } catch {
      // fallthrough
    }
  }

  // If it still contains "token=" in a query-like form, extract manually
  if (/token=/i.test(t)) {
    try {
      const query = t.includes("?") ? t.split("?").slice(1).join("?") : t;
      const sp = new URLSearchParams(query);
      const q = sp.get("token");
      if (q) t = q;
    } catch {
      // ignore
    }
  }

  // Repeated decode to handle double/triple-encoding
  // e.g. %257C -> %7C -> |
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = tryDecodeOnce(t);
    // If it still contains %7C, try one more time in next loop
    if (t === before && !/%25/i.test(t) && !/%7C/i.test(t)) break;
  }

  // Collapse spaces around pipes just in case
  t = t.replace(/\s*\|\s*/g, "|");

  return t;
}

function splitFiveParts(token: string): string[] | null {
  const parts = token.split("|");
  if (parts.length !== 5) return null;
  const [v] = parts;
  if (v !== "v1") return null;
  return parts;
}

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export default function CheckinScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();

  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [debugToken, setDebugToken] = useState<string>("");
  const didSubmitRef = useRef(false);

  const normalizedToken = useMemo(() => normalizeToken(token), [token]);
  const fiveParts = useMemo(() => (normalizedToken ? splitFiveParts(normalizedToken) : null), [normalizedToken]);

  const eventId = useMemo(() => {
    if (!fiveParts) return null;
    const e = fiveParts[1];
    return isUuidLike(e) ? e : null;
  }, [fiveParts]);

  useEffect(() => {
    if (didSubmitRef.current) return;
    if (!normalizedToken) return;
    didSubmitRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedToken]);

  async function submit() {
    setMessage("");
    setStatus("submitting");

    if (!normalizedToken) {
      setStatus("error");
      setMessage("Missing token.");
      return;
    }

    if (!fiveParts) {
      setStatus("error");
      setMessage("Invalid or missing check-in token.");
      setDebugToken(normalizedToken);
      return;
    }

    try {
      const args: Record<string, any> = {
        p_token: normalizedToken,
        p_event_id: eventId ?? null,
      };

      const { data, error } = await supabase.rpc("qr_checkin", args);

      if (error) {
        const msg = error.message || "Check-in failed.";
        setStatus("error");
        setMessage(msg);
        setDebugToken(normalizedToken);
        return;
      }

      setStatus("ok");
      setMessage("Check-in completed.");
      const _ok: RpcOk = data;
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message ?? "Unexpected error.");
      setDebugToken(normalizedToken);
    }
  }

  function copyToken() {
    if (!normalizedToken) return;
    Clipboard.setStringAsync(normalizedToken).then(() => {
      Alert.alert("Copied", "Token copied to clipboard.");
    });
  }

  function goBack() {
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Check-in</Text>

        {!normalizedToken && (
          <View style={styles.block}>
            <Text style={styles.error}>Missing token.</Text>
            <TouchableOpacity style={styles.btn} onPress={goBack}>
              <Text style={styles.btnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {normalizedToken && status === "submitting" && (
          <View style={styles.block}>
            <ActivityIndicator size="large" />
            <Text style={styles.note}>Submitting your check-in…</Text>
          </View>
        )}

        {normalizedToken && status === "ok" && (
          <View style={styles.block}>
            <Text style={styles.ok}>✅ {message}</Text>
            {eventId && <Text style={styles.note}>Event: {eventId}</Text>}
            <TouchableOpacity style={styles.btn} onPress={goBack}>
              <Text style={styles.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {normalizedToken && status === "error" && (
          <View style={styles.block}>
            <Text style={styles.error}>⚠ {message}</Text>
            {eventId && <Text style={styles.note}>Event: {eventId}</Text>}
            {!!debugToken && (
              <TouchableOpacity style={styles.copyBtn} onPress={copyToken}>
                <Text style={styles.copyText}>Copy Token</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btn} onPress={submit}>
              <Text style={styles.btnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnGhost} onPress={goBack}>
              <Text style={styles.btnGhostText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 16, gap: 16, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  block: { alignItems: "center", gap: 12 },
  ok: { fontSize: 18, color: "#0a7", textAlign: "center" },
  error: { fontSize: 16, color: "#d00", textAlign: "center" },
  note: { fontSize: 14, color: "#666", textAlign: "center" },
  btn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: "#111827", borderRadius: 10 },
  btnText: { color: "#fff", fontWeight: "600" },
  btnGhost: { marginTop: 4, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#111827" },
  btnGhostText: { color: "#111827", fontWeight: "600" },
  copyBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#f1f1f1" },
  copyText: { color: "#333", fontWeight: "500" },
});
