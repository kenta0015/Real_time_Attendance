import React from "react";
import { Text, Pressable } from "react-native";
import { Stack, Link, useLocalSearchParams } from "expo-router";

export default function Layout() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eid = Array.isArray(id) ? id?.[0] : id;

  return (
    <Stack
      screenOptions={{
        headerRight: () =>
          eid ? (
            <Link href={`/organize/events/${eid}/invite`} asChild>
              <Pressable hitSlop={10}>
                <Text style={{ color: "#60a5fa", fontWeight: "700" }}>Invite</Text>
              </Pressable>
            </Link>
          ) : null,
      }}
    />
  );
}
