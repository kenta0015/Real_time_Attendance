// app/(tabs)/organize/component/EventsSection.tsx
import React from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import type { Database } from "../../../../types/database";
import { styles } from "../styles";

type Group = Database["public"]["Tables"]["groups"]["Row"];
type EventRow = Database["public"]["Tables"]["events"]["Row"];

type Props = {
  group: Group;
  events: EventRow[];
  onCreate: () => void;
  onEdit: (ev: EventRow) => void;
};

export default function EventsSection({ group, events, onCreate, onEdit }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Events in “{group.name}”</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onCreate}>
          <Text style={styles.primaryBtnText}>+ New Event</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>No events yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.start_time} → {item.end_time}
              </Text>
              <Text style={styles.cardMeta}>
                {item.location_name} ({item.latitude}, {item.longitude})
              </Text>
              {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => onEdit(item)}>
                <Text style={styles.secondaryBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}
