// app/(tabs)/organize/component/GroupsSection.tsx
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import type { Database } from "../../../../types/database";
import { styles } from "../styles";

type Group = Database["public"]["Tables"]["groups"]["Row"];

type Props = {
  groups: Group[];
  onCreate: () => void;
  onSelect: (g: Group) => void;
  onEdit: (g: Group) => void;
};

export default function GroupsSection({ groups, onCreate, onSelect, onEdit }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Groups</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onCreate}>
          <Text style={styles.primaryBtnText}>+ New Group</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>No groups yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>{item.category}</Text>
              {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => onSelect(item)}>
                <Text style={styles.outlineBtnText}>Manage Events</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => onEdit(item)}>
                <Text style={styles.secondaryBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 8 }}
      />
    </View>
  );
}
