// app/lib/safeNoti.ts
import { Platform } from "react-native";
import Constants from "expo-constants";

export const notiAvailable =
  Platform.OS !== "web" &&
  !(Platform.OS === "android" && Constants.appOwnership === "expo"); // Expo Go(Android)では不可

export async function noti() {
  if (!notiAvailable) return null;
  const mod = await import("expo-notifications");
  return mod;
}

export async function ensureDefaultHandler() {
  const N = await noti();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("default", {
      name: "default",
      importance: N.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestPerms() {
  const N = await noti();
  if (!N) return false;
  const { status } = await N.requestPermissionsAsync();
  return status === "granted";
}
