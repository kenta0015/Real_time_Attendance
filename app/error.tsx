// app/+error.tsx  ← ファイル名は +error.tsx
import { View, Text, StyleSheet, Platform, TouchableOpacity } from "react-native";

// 型はシンプルにして型不一致で落ちないようにする
type ErrorProps = { error: unknown; retry: () => void };

export default function GlobalErrorScreen({ error, retry }: ErrorProps) {
  // ここで絶対に undefined 参照しないようガード
  const msg = String((error as any)?.message ?? error ?? "Unknown error");
  const stack = String((error as any)?.stack ?? "No stack");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>

      <Text style={styles.label}>Message</Text>
      <Text style={styles.text}>{msg}</Text>

      <Text style={styles.label}>Stack</Text>
      <Text style={styles.stack} selectable>{stack}</Text>

      <TouchableOpacity onPress={retry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 8, color: "#111827" },
  label: { fontWeight: "700", color: "#374151", marginTop: 6 },
  text: { color: "#111827" },
  stack: {
    color: "#6B7280",
    fontFamily: Platform.select({ android: "monospace", ios: "Menlo", default: "monospace" }),
  },
  button: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});




