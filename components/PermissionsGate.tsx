// components/PermissionsGate.tsx
// One-time friendly permission flow (Location / Camera / Notifications).
// - First launch: compact explainer + "Grant" button.
// - Later launches: silent checks (no blocking).
// - Shows "Open Settings" if user selected “Don’t ask again” on Android.

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Camera } from "expo-camera";
import { showToast } from "../lib/toast";
import { STR } from "../lib/strings";

const RAN_KEY = "@rta.perms.ran.v1";

type Props = { children: React.ReactNode };

type CamPerm = Awaited<ReturnType<typeof Camera.getCameraPermissionsAsync>>;
type LocPerm = Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>;
type NotifPerm = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

async function getStatuses() {
  // Avoid Promise.all tuple typing issues: fetch sequentially with explicit types.
  const fg: LocPerm = await Location.getForegroundPermissionsAsync();
  const bg: LocPerm = await Location.getBackgroundPermissionsAsync();
  const cam: CamPerm = await Camera.getCameraPermissionsAsync();
  const notif: NotifPerm = await Notifications.getPermissionsAsync();
  return { fg, bg, cam, notif };
}

async function requestAll() {
  await Location.requestForegroundPermissionsAsync().catch(() => null);
  await Location.requestBackgroundPermissionsAsync().catch(() => null);
  await Camera.requestCameraPermissionsAsync().catch(() => null);
  if (Platform.OS !== "web") {
    await Notifications.requestPermissionsAsync().catch(() => null);
  }
  return getStatuses();
}

export default function PermissionsGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [showGate, setShowGate] = useState(false);
  const [statuses, setStatuses] = useState<{ fg: LocPerm; bg: LocPerm; cam: CamPerm; notif: NotifPerm } | null>(null);

  useEffect(() => {
    (async () => {
      const ran = (await AsyncStorage.getItem(RAN_KEY)) === "1";
      const st = await getStatuses();
      setStatuses(st);
      setShowGate(!ran);
      setLoading(false);
    })();
  }, []);

  const essentialGranted = useMemo(() => {
    if (!statuses) return false;
    const okLoc = statuses.fg?.granted === true;
    const okCam = statuses.cam?.granted === true;
    return okLoc && okCam;
  }, [statuses]);

  const deniedForever = useMemo(() => {
    const noAskLoc = statuses?.fg?.granted === false && (statuses?.fg as any)?.canAskAgain === false;
    const noAskCam = statuses?.cam?.granted === false && (statuses?.cam as any)?.canAskAgain === false;
    return !!(noAskLoc || noAskCam);
  }, [statuses]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!showGate) {
    return <>{children}</>;
  }

  return (
    <View style={{ flex: 1, padding: 20, gap: 16, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Allow basic permissions</Text>
      <Text style={{ fontSize: 14, color: "#475569", textAlign: "center" }}>
        • Location (for on-site check-in){"\n"}
        • Camera (for QR){"\n"}
        • Notifications (optional)
      </Text>

      <Pressable
        onPress={async () => {
          setLoading(true);
          const st = await requestAll();
          setStatuses(st);
          await AsyncStorage.setItem(RAN_KEY, "1");
          setShowGate(false);
          setLoading(false);
          showToast("Permissions updated");
        }}
        style={{
          backgroundColor: "#2563eb",
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 12,
          minWidth: 200,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Grant permissions</Text>
      </Pressable>

      {deniedForever ? (
        <Pressable
          onPress={() => {
            try {
              Linking.openSettings();
            } catch {}
          }}
          style={{
            backgroundColor: "#334155",
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 10,
            minWidth: 200,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>{STR.openSettings}</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={async () => {
          await AsyncStorage.setItem(RAN_KEY, "1");
          setShowGate(false);
          showToast("You can grant permissions later from Settings");
        }}
        style={{ padding: 8 }}
      >
        <Text style={{ color: "#64748b" }}>Skip for now</Text>
      </Pressable>

      <View style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: essentialGranted ? "#16a34a" : "#ef4444" }}>
          Status: {essentialGranted ? "Ready" : "Some permissions missing"}
        </Text>
      </View>
    </View>
  );
}
