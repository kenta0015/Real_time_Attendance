// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Platform, DeviceEventEmitter } from "react-native";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const unstable_settings = { initialRouteName: "events" };

const ROLE_KEY = "rta_dev_role";
const enableDev =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

function useDevRole(): "organizer" | "attendee" {
  const [role, setRole] = useState<"organizer" | "attendee">("organizer");
  useEffect(() => {
    const read = async () => {
      const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
      setRole(v === "attendee" ? "attendee" : "organizer");
    };
    read();
    const sub = DeviceEventEmitter.addListener("rta:set-role", (r) => {
      if (r === "attendee" || r === "organizer") {
        AsyncStorage.setItem(ROLE_KEY, r);
        setRole(r);
      }
    });
    return () => sub.remove();
  }, []);
  return role;
}

export default function TabLayout() {
  const role = useDevRole();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          borderTopColor: "#e5e7eb",
          borderTopWidth: Platform.OS === "android" ? 0.4 : 0.2,
        },
      }}
    >
      {/* Canonical list */}
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          href: { pathname: "/events" },
        }}
      />

      {/* Organizer tools */}
      <Tabs.Screen
        name="organize"
        options={{
          title: role === "attendee" ? "Organize (locked)" : "Organize",
          href: role === "attendee" && !enableDev ? null : { pathname: "/organize" },
        }}
      />

      {/* Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          href: { pathname: "/profile" },
        }}
      />

      {/* --- HIDE auto-registered nested routes under (tabs) --- */}
      <Tabs.Screen name="me/events" options={{ href: null }} />
      <Tabs.Screen name="me/groups" options={{ href: null }} />
      <Tabs.Screen name="organize/admin" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]/live" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]/qr" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]/invite" options={{ href: null }} />
      <Tabs.Screen name="organize/events/[id]/scan" options={{ href: null }} />
      <Tabs.Screen name="organize/location-test" options={{ href: null }} />

      {/* Debug tab (dev only or explicitly enabled) */}
      <Tabs.Screen
        name="debug"
        options={{
          title: "Debug",
          href: enableDev ? { pathname: "/debug" } : null,
        }}
      />
    </Tabs>
  );
}
