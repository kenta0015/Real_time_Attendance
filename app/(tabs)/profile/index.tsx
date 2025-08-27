import { View, Text, StyleSheet } from "react-native";

export default function Profile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.body}>Guest mode (no Auth yet).</Text>
      <Text style={styles.small}>M0: just a placeholder screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  body: { color: "#444" },
  small: { color: "#777" },
});
