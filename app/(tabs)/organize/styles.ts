// app/(tabs)/organize/styles.ts
import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },

  section: { marginTop: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold" },

  card: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold" },
  cardMeta: { fontSize: 12, color: "#555", marginTop: 4 },
  cardDesc: { fontSize: 14, marginTop: 6 },

  row: { flexDirection: "row", gap: 8, marginTop: 10 },

  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600" },

  secondaryBtn: {
    backgroundColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  secondaryBtnText: { color: "#fff", fontWeight: "600" },

  outlineBtn: {
    borderWidth: 1,
    borderColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  outlineBtnText: { color: "#2563eb", fontWeight: "600" },

  emptyText: { textAlign: "center", color: "#666", marginVertical: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    maxHeight: "90%",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  label: { fontSize: 12, color: "#374151", marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ ios: 12, android: 8, default: 8 }),
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
});
