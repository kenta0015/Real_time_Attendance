// app/(tabs)/events/[id].tsx
import { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

export default function LegacyEventsRedirect() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (id && typeof id === "string") {
      router.replace(`/organize/events/${encodeURIComponent(id)}`);
    }
  }, [id]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 8 }}>Opening event…</Text>
    </View>
  );
}
