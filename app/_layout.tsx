// app/_layout.tsx
import React, { useEffect } from "react";
import { View, Platform, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";

// ★ 最上段で必ず読み込む（超早期ロガー）
import { installGlobalLogger } from "../lib/logger";

import DevRoleBadge from "../components/DevRoleBadge";
import PermissionsGate from "../components/PermissionsGate";
import ToastHost from "../components/ToastHost";

export const unstable_settings = { initialRouteName: "join" };

// Ultra-early
installGlobalLogger();

// Dev / production switch (shared policy)
const enableDev =  false;
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

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

    // ==== Updates 可視化（チャネル/ランタイム/直近Updateなど）====
    (async () => {
      try {
        // SDK 50+ の Updates API
        const ch = Updates.channel ?? "(unknown)";
        const rv = Updates.runtimeVersion ?? "(unknown)";
        const id = Updates.updateId ?? "(none)";
        const embedded = Updates.isEmbeddedLaunch ?? false;
        console.info("[updates] channel:", ch);
        console.info("[updates] runtimeVersion:", rv);
        console.info("[updates] updateId:", id, "embeddedLaunch:", embedded);

        // 追加診断
        const st = await Updates.checkForUpdateAsync().catch(() => null);
        if (st) console.info("[updates] checkForUpdate:", st);
      } catch (e) {
        console.warn("[updates] failed to read info", e);
      }
    })();

    // ==== React Navigation 由来の警告も必ず捕捉 ====
    // LogBox は抑制ではなく “見逃し”を防ぐために既定のまま。ここでは念のため無視ルールなし。
    LogBox.ignoreLogs([]); // 何も無視しない
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
