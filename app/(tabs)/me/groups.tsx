import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ToastAndroid,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";

type GroupRow = { id: string; name: string | null; description?: string | null };

export default function MyGroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notify = (msg: string) => {
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert("Info", msg);
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, description")
        .order("name", { ascending: true });
      if (error) throw error;
      setGroups(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
      notify("Refreshed");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const Header = () => (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
      <Text style={styles.header}>Organize</Text>
      {error ? (
        <View style={styles.bannerError}>
          <Text style={styles.bannerText}>Error: {error}</Text>
        </View>
      ) : null}
    </View>
  );

  const Empty = () => (
    <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No groups</Text>
        <Text style={styles.dim}>
          Ask an organizer to create a group, or create one from here after you get organizer access.
        </Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={loading ? [] : groups}
      keyExtractor={(g) => g.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={<Header />}
      ListEmptyComponent={!loading ? <Empty /> : null}
      contentContainerStyle={{ paddingBottom: 24 }}
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
          <TouchableOpacity
            style={styles.card}
            // Hidden tab screenへ安全遷移（gid付）
            onPress={() =>
              router.push({
                pathname: "/organize",
                params: { gid: item.id },
              })
            }
          >
            <Text style={styles.groupName}>{item.name ?? "(Untitled group)"}</Text>
            {item.description ? <Text style={styles.dim}>{item.description}</Text> : null}
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  dim: { color: "#6B7280" },
  bannerError: {
    backgroundColor: "#FFEAEA",
    borderColor: "#FF8A8A",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  bannerText: { color: "#B00020" },
  emptyBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 14,
  },
  groupName: { fontWeight: "700", fontSize: 16, marginBottom: 2 },
});




