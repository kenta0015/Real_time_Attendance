import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="organize/index"
        options={{
          title: "Organize",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="event" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" color={color} size={size} />
          ),
        }}
      />
      {/* タブに出さない内部画面（リンクで遷移） */}
      <Tabs.Screen name="organize/events/[id]" options={{ href: null }} />
      <Tabs.Screen name="organize/admin/[eventId]/live" options={{ href: null }} />
      <Tabs.Screen name="organize/location-test" options={{ href: null }} />
    </Tabs>
  );
}
