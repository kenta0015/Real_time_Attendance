// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

const ROLE_KEY = "rta_dev_role";

function useDevRole(): "organizer" | "attendee" {
  const [role, setRole] = useState<"organizer" | "attendee">("organizer");
  useEffect(() => {
    const read = async () => {
      const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
      setRole(v === "attendee" ? "attendee" : "organizer");
    };
    read();
    const sub = DeviceEventEmitter.addListener("rta_role_changed", read);
    return () => sub.remove();
  }, []);
  return role;
}

export default function TabsLayout() {
  useDevRole(); // keep role in sync for conditional tab visibility if needed later

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Platform.select({ ios: "#111827", android: "#111827", default: "#111827" }),
      }}
    >
      {/* Organize */}
      <Tabs.Screen
        name="organize/index"
        options={{
          title: "Organize",
          tabBarIcon: () => null,
        }}
      />

      {/* My Events → History（ラベル変更） */}
      <Tabs.Screen
        name="me/events"
        options={{
          title: "History",
          tabBarIcon: () => null,
        }}
      />

      {/* Profile */}
      <Tabs.Screen
        name="profile/index"
        options={{
          title: "Profile",
          tabBarIcon: () => null,
        }}
      />

      {/* Hide non-tab routes from the bar (still navigable) */}
      <Tabs.Screen name="me/groups" options={{ href: null }} />
      <Tabs.Screen name="organize/admin" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]/live" options={{ href: null }} />
      <Tabs.Screen name="organize/location-test" options={{ href: null }} />
      <Tabs.Screen name="debug" options={{ href: null }} />
    </Tabs>
  );
}

