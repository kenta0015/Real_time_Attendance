import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function JoinScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const raw = params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Join</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Token</Text>
        <Text style={styles.value}>{token ?? "—"}</Text>
      </View>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => Alert.alert("Join (placeholder)", `token=${token ?? "(none)"}`)}
      >
        <Text style={styles.btnText}>Join with token</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        This screen only verifies deep-link parsing. Server redemption is later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#0b0b0c" },
  h1: { fontSize: 22, fontWeight: "700", color: "#fff" },
  card: { backgroundColor: "#17181a", borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: "#232428" },
  label: { color: "#9aa1ac", fontSize: 12 },
  value: {
    color: "#e8ebf0",
    fontWeight: "600",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  btn: { backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  note: { color: "#97a0aa", fontSize: 12 },
});
