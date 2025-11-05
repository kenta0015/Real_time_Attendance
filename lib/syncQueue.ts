// lib/syncQueue.ts
// Offline queue for geofence events with idempotency.
// - Storage key: @rta.geo.queue.v1
// - Public API: enqueue, flushOnce, getLength, clear
// The queue persists across app restarts and can be flushed by callers (e.g., after network recovery).

import AsyncStorage from "@react-native-async-storage/async-storage";

export type GeoDir = "ENTER" | "EXIT";

export type GeoEventPayload = {
  event_id: string | null;
  dir: GeoDir;
  at: string; // ISO8601
  region_id?: string | null;
  acc_m?: number | null;
  device?: string | null;
  idem: string; // idempotency key
};

const KEY = "@rta.geo.queue.v1";

async function readQueue(): Promise<GeoEventPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as GeoEventPayload[];
    return [];
  } catch {
    return [];
  }
}

async function writeQueue(items: GeoEventPayload[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function getLength(): Promise<number> {
  const q = await readQueue();
  return q.length;
}

/** Push with simple de-dupe by idem (keep the latest). */
export async function enqueue(p: GeoEventPayload): Promise<void> {
  const q = await readQueue();
  const idx = q.findIndex((x) => x.idem === p.idem);
  if (idx >= 0) {
    q[idx] = p;
  } else {
    q.push(p);
  }
  await writeQueue(q);
}

/** Flush once by calling the provided poster; remove only the successfully posted items. */
export async function flushOnce(
  poster: (p: GeoEventPayload) => Promise<boolean>
): Promise<{ ok: number; ng: number }> {
  const q = await readQueue();
  if (q.length === 0) return { ok: 0, ng: 0 };

  const remain: GeoEventPayload[] = [];
  let ok = 0,
    ng = 0;
  for (const item of q) {
    try {
      const done = await poster(item);
      if (done) ok++;
      else {
        ng++;
        remain.push(item);
      }
    } catch {
      ng++;
      remain.push(item);
    }
  }
  await writeQueue(remain);
  return { ok, ng };
}

export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}




