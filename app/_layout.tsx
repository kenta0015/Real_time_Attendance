// app/_layout.tsx
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View, Platform } from "react-native";
import DevRoleBadge from "../components/DevRoleBadge";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import PermissionsGate from "../components/PermissionsGate";
import ToastHost from "../components/ToastHost";

export const unstable_settings = { initialRouteName: "(tabs)" };

Notifications.setNotificationHandler({
  handleNotification: async (_n: Notifications.Notification) => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "ios") {
      Notifications.setNotificationCategoryAsync?.("default", []);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <PermissionsGate>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <Stack screenOptions={{ headerShown: false }} />
          <DevRoleBadge />
          <ToastHost />
        </View>
      </PermissionsGate>
    </SafeAreaProvider>
  );
}
