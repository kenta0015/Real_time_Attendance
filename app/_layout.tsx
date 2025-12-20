// app/_layout.tsx
import React, { useEffect } from "react";
import { View, Platform, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";

// Ultra-early logger
import { installGlobalLogger } from "../lib/logger";
import { devSwitchEnabled } from "../stores/devRole";

import DevRoleBadge from "../components/DevRoleBadge";
import PermissionsGate from "../components/PermissionsGate";
import ToastHost from "../components/ToastHost";

export const unstable_settings = { initialRouteName: "index" };

// Ultra-early
installGlobalLogger();

// Dev / production switch (shared policy)
const enableDev = devSwitchEnabled();

console.info("[dev-switch] enableDev =", enableDev);

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

    (async () => {
      try {
        const ch = Updates.channel ?? "(unknown)";
        const rv = Updates.runtimeVersion ?? "(unknown)";
        const id = Updates.updateId ?? "(none)";
        const embedded = Updates.isEmbeddedLaunch ?? false;
        console.info("[updates] channel:", ch);
        console.info("[updates] runtimeVersion:", rv);
        console.info("[updates] updateId:", id, "embeddedLaunch:", embedded);

        const st = await Updates.checkForUpdateAsync().catch(() => null);
        if (st) console.info("[updates] checkForUpdate:", st);
      } catch (e) {
        console.warn("[updates] failed to read info", e);
      }
    })();

    LogBox.ignoreLogs([]);
  }, []);

  useEffect(() => {
    console.info("[RootLayout] mounted");
  }, []);

  return (
    <SafeAreaProvider>
      <PermissionsGate>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <Stack screenOptions={{ headerShown: false }} />
          {enableDev && <DevRoleBadge />}
          <ToastHost />
        </View>
      </PermissionsGate>
    </SafeAreaProvider>
  );
}
