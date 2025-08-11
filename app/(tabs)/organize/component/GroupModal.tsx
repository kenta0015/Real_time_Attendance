// app/(tabs)/organize/component/GroupModal.tsx
import React from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { styles } from "../styles";

type Mode = "create" | "edit";

type Props = {
  visible: boolean;
  mode: Mode;
  gName: string;
  setGName: (v: string) => void;
  gCategory: string;
  setGCategory: (v: string) => void;
  gDesc: string;
  setGDesc: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function GroupModal({
  visible,
  mode,
  gName,
  setGName,
  gCategory,
  setGCategory,
  gDesc,
  setGDesc,
  onCancel,
  onSave,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{mode === "create" ? "Create Group" : "Edit Group"}</Text>
          <ScrollView>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={gName} onChangeText={setGName} placeholder="e.g., Weekend Runners" />

            <Text style={styles.label}>Category</Text>
            <TextInput style={styles.input} value={gCategory} onChangeText={setGCategory} placeholder="e.g., Sports" />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              value={gDesc}
              onChangeText={setGDesc}
              placeholder="About this group..."
              multiline
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.outlineBtn} onPress={onCancel}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
