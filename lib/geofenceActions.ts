// lib/geofenceActions.ts
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { GEOFENCE_TASK } from "./geofence";

export type GeoPoint = { latitude: number; longitude: number };

async function ensurePermissions() {
  const n = await Notifications.getPermissionsAsync();
  if (!n.granted) await Notifications.requestPermissionsAsync();

  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== "granted") await Location.requestForegroundPermissionsAsync();

  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== "granted") await Location.requestBackgroundPermissionsAsync();
}

export async function armGeofenceAt(point: GeoPoint, radius: number) {
  await ensurePermissions();

  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});

  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    {
      identifier: "event",
      latitude: point.latitude,
      longitude: point.longitude,
      radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    } as any,
  ]);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Geofence armed",
      body: `center=(${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}), r=${radius}m`,
    },
    trigger: null,
  });
}

export async function disarmGeofence() {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}

export async function geofenceStatus(): Promise<{ started: boolean }> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  return { started };
}
