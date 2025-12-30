// lib/geofenceActions.ts
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import {
  GEOFENCE_TASK,
  GeofenceRegion,
  hasGeofencingStarted,
  setActiveEventMeta,
  startGeofencing,
  stopGeofencing,
} from "./geofence";

export type GeoPoint = { latitude: number; longitude: number };

type ArmOptions = {
  eventId?: string | null;
  endUtc?: string | null; // ISO UTC; optional (we will try to fetch if not provided)
  notify?: boolean;
};

function normalizeEventId(input?: string | null): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (s.startsWith("event:")) {
    const rest = s.slice("event:".length).trim();
    return rest ? rest : null;
  }
  return s;
}

function clampRadius(input: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return 100;
  const v = Math.floor(n);
  return Math.min(150, Math.max(100, v));
}

function assertValidPoint(point: GeoPoint) {
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Invalid geofence location.");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Invalid geofence location.");
  }
}

async function assertAlwaysLocationGranted() {
  let fg: Location.PermissionResponse;
  let bg: Location.PermissionResponse;

  try {
    fg = await Location.getForegroundPermissionsAsync();
  } catch {
    throw new Error("Unable to read location permission status.");
  }

  try {
    bg = await Location.getBackgroundPermissionsAsync();
  } catch {
    throw new Error("Unable to read background location permission status.");
  }

  const fgGranted = !!fg.granted || fg.status === "granted";
  const bgGranted = !!bg.granted || bg.status === "granted";

  if (!fgGranted || !bgGranted) {
    throw new Error("Always / Background location permission is required.");
  }
}

async function safeNotify(title: string, body?: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body: body ?? "" },
      trigger: null,
    });
  } catch {}
}

async function resolveEndUtc(eventId: string, maybeEndUtc?: string | null): Promise<string | null> {
  if (maybeEndUtc) return String(maybeEndUtc);

  // NOTE:
  // - Call-sites do NOT need to change to enable end_utc persistence.
  // - If endUtc is not provided, we best-effort fetch it here (so active_event_end_utc is usually saved).
  try {
    const { data, error } = await supabase.from("events").select("end_utc").eq("id", eventId).maybeSingle();
    if (error) throw error;
    const v = (data as any)?.end_utc;
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

/**
 * Arms a single geofence region for the organizer device.
 * Phase 0 goal:
 * - No TaskManager.defineTask here (canonical task lives in lib/geofence.ts)
 * - Delegate permission + start/stop to lib/geofence.ts
 * - Attach event context via AsyncStorage (active_event_id + active_event_end_utc)
 *
 * Phase 1 enforcement (do not trust UI):
 * - Require a valid eventId (non-empty)
 * - Block on web
 * - Require Always/Background permission before starting (check-only; no prompts here)
 *
 * Phase 2 (event binding):
 * - Persist active event meta (event_id + end_utc) so background ENTER/EXIT never loses event_id
 * - Keep region.identifier = "event:<id>" as a redundant backup path
 */
export async function armGeofenceAt(point: GeoPoint, radius: number, opts?: ArmOptions) {
  if (Platform.OS === "web") {
    throw new Error("Geofencing is not supported on web.");
  }

  const eventIdPlain = normalizeEventId(opts?.eventId ?? null);
  if (!eventIdPlain) {
    throw new Error("Missing eventId for Live attendee check.");
  }

  assertValidPoint(point);
  const r = clampRadius(radius);

  // Hard gate: do not start unless Always is already granted.
  await assertAlwaysLocationGranted();

  // Persist active event meta for the background task (preferred).
  const endUtc = await resolveEndUtc(eventIdPlain, opts?.endUtc ?? null);
  await setActiveEventMeta({ eventId: eventIdPlain, endUtc });

  const region: GeofenceRegion = {
    identifier: `event:${eventIdPlain}`,
    latitude: point.latitude,
    longitude: point.longitude,
    radius: r,
    notifyOnEnter: true,
    notifyOnExit: true,
  };

  await startGeofencing([region]);

  if (opts?.notify) {
    await safeNotify(
      "Live attendee check started",
      `center=(${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}), r=${r}m`
    );
  }
}

export async function disarmGeofence() {
  await stopGeofencing();
  await setActiveEventMeta(null);
}

export async function geofenceStatus(): Promise<{ started: boolean }> {
  const started = await hasGeofencingStarted();
  return { started };
}

export { GEOFENCE_TASK };
