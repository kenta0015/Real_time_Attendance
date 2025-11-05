// lib/geofence.ts
// Geofencing task + server sync with offline queue (Step 6).
// Exports:
// - GEOFENCE_TASK
// - ensureLocationPermissions()
// - hasGeofencingStarted()
// - startGeofencing(regions)
// - stopGeofencing()
// - setActiveEventId(eventId)
//
// Behavior:
// - Background task listens ENTER/EXIT and posts to Supabase via RPC('geofence_log') or table insert fallback.
// - If post fails, pushes to offline queue and attempts a best-effort flush.

import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { enqueue, flushOnce, GeoEventPayload } from "./syncQueue";

export const GEOFENCE_TASK = "rta-geofence";
const ACTIVE_EVENT_KEY = "@rta.active_event_id";
const LAST_EVENT_KEY = "@rta.geo.last.v1";
const DEBOUNCE_SEC = 30;

/** Persist active event id so the background task can attach it. */
export async function setActiveEventId(eventId: string | null) {
  if (!eventId) {
    await AsyncStorage.removeItem(ACTIVE_EVENT_KEY);
    return;
  }
  await AsyncStorage.setItem(ACTIVE_EVENT_KEY, eventId);
}

async function getActiveEventId(): Promise<string | null> {
  return (await AsyncStorage.getItem(ACTIVE_EVENT_KEY)) || null;
}

/** Best-effort local notification (safe in background); ignore errors. */
async function notify(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {}
}

function nowIso() {
  return new Date().toISOString();
}

async function shouldDebounce(dir: "ENTER" | "EXIT"): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(LAST_EVENT_KEY);
    const last = raw
      ? (JSON.parse(raw) as { dir: "ENTER" | "EXIT"; at: string })
      : null;
    const now = Date.now();
    if (last && last.dir === dir) {
      const dt = (now - Date.parse(last.at)) / 1000;
      if (dt < DEBOUNCE_SEC) return true;
    }
    await AsyncStorage.setItem(
      LAST_EVENT_KEY,
      JSON.stringify({ dir, at: new Date(now).toISOString() })
    );
    return false;
  } catch {
    return false;
  }
}

/** Create idempotency key stable within a 30s window. */
async function makeIdem(
  eventId: string | null,
  regionId: string | null,
  dir: "ENTER" | "EXIT",
  atIso: string
) {
  // Round down to 30s windows for natural idempotency across retries.
  const slot = Math.floor(Date.parse(atIso) / 1000 / DEBOUNCE_SEC);
  const base = `${eventId ?? "null"}|${regionId ?? "null"}|${dir}|${slot}`;
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base
  );
}

async function postToServer(p: GeoEventPayload): Promise<boolean> {
  try {
    // Prefer RPC if available (server will upsert by idem + update attendance/arrival_result)
    const resp = await supabase.rpc("geofence_log", {
      p_event_id: p.event_id,
      p_dir: p.dir,
      p_at: p.at,
      p_region: p.region_id ?? null,
      p_acc: p.acc_m ?? null,
      p_device: p.device ?? null,
      p_idem: p.idem,
    });
    if (resp.error) {
      // Fallback: raw insert to geofence_events (if table exists)
      const ins = await supabase.from("geofence_events").insert({
        event_id: p.event_id,
        dir: p.dir,
        at: p.at,
        region_id: p.region_id ?? null,
        acc_m: p.acc_m ?? null,
        device: p.device ?? null,
        idem: p.idem,
      });
      if (ins.error) throw ins.error;
    }
    return true;
  } catch {
    return false;
  }
}

// Define background task once
let __defined = false;
function defineTaskOnce() {
  if (__defined) return;
  try {
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
      if (error) {
        await notify(
          "Geofence task error",
          String(error?.message ?? "Unknown error")
        );
        return;
      }
      const eventType = (data as any)
        ?.eventType as Location.GeofencingEventType | undefined;
      const region = (data as any)?.region as
        | Location.LocationRegion
        | undefined;
      const dir: "ENTER" | "EXIT" =
        eventType === Location.GeofencingEventType.Enter
          ? "ENTER"
          : eventType === Location.GeofencingEventType.Exit
          ? "EXIT"
          : "ENTER";

      if (await shouldDebounce(dir)) return;

      const at = nowIso();
      const regionId = (region?.identifier as string | undefined) ?? null;
      // Try to parse event id from identifier like "event:<id>"
      let eventId = await getActiveEventId();
      if (!eventId && regionId && regionId.startsWith("event:")) {
        eventId = regionId.slice("event:".length);
      }

      const payload: GeoEventPayload = {
        event_id: eventId,
        dir,
        at,
        region_id: regionId,
        acc_m: null,
        device: "mobile",
        idem: await makeIdem(eventId, regionId, dir, at),
      };

      const ok = await postToServer(payload);
      if (!ok) {
        await enqueue(payload);
        await flushOnce(postToServer); // best-effort
      }
    });
    __defined = true;
  } catch {
    __defined = true; // already defined (HMR)
  }
}
defineTaskOnce();

// Public helpers

export async function ensureLocationPermissions(): Promise<{
  ok: boolean;
  status: Location.PermissionStatus;
  bg?: Location.PermissionStatus;
}> {
  const f = await Location.requestForegroundPermissionsAsync();
  if (f.status !== "granted") return { ok: false, status: f.status };

  let bg: Location.PermissionStatus | undefined;
  if (await Location.isBackgroundLocationAvailableAsync()) {
    const r = await Location.requestBackgroundPermissionsAsync();
    bg = r.status;
    if (r.status !== "granted")
      return { ok: false, status: f.status, bg: r.status };
  }
  return { ok: true, status: f.status, bg };
}

export async function hasGeofencingStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}

export type GeofenceRegion = {
  identifier?: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  notifyOnEnter?: boolean;
  notifyOnExit?: boolean;
};

export async function startGeofencing(regions: GeofenceRegion[]): Promise<void> {
  const p = await ensureLocationPermissions();
  if (!p.ok) throw new Error("Location permission not granted");
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(
      () => false
    );
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions as any);
    // trigger early flush attempt
    await flushOnce(postToServer);
  } catch (e: any) {
    throw new Error(e?.message ?? "Failed to start geofencing.");
  }
}

export async function stopGeofencing(): Promise<void> {
  try {
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(
      () => false
    );
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch {}
}




