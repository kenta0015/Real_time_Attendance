// app/(tabs)/organize/api.ts
import { supabase } from "../../../lib/supabase";
import type { Database } from "../../../types/database";

type GroupRow = Database["public"]["Tables"]["groups"]["Row"];
type GroupInsert = Database["public"]["Tables"]["groups"]["Insert"];
type GroupUpdate = Database["public"]["Tables"]["groups"]["Update"];
type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

function errMsg(prefix: string, e: any) {
  const detail = e?.message ?? e?.error_description ?? JSON.stringify(e);
  console.log(`[API] ${prefix} error:`, e);
  return `${prefix}: ${detail}`;
}

export async function fetchGroupsApi(uid: string): Promise<{ data: GroupRow[]; error?: string }> {
  const { data, error, status } = await supabase
    .from("groups")
    .select("*")
    .eq("organizer_id", uid)
    .order("created_at", { ascending: false });
  console.log("[API] fetchGroups status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { data: [], error: errMsg("fetchGroups", error) };
  return { data: data ?? [] };
}

export async function fetchEventsApi(groupId: string): Promise<{ data: EventRow[]; error?: string }> {
  const { data, error, status } = await supabase
    .from("events")
    .select("*")
    .eq("group_id", groupId)
    .order("start_time", { ascending: true });
  console.log("[API] fetchEvents status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { data: [], error: errMsg("fetchEvents", error) };
  return { data: data ?? [] };
}

export async function createGroupApi(payload: GroupInsert): Promise<{ error?: string; rows?: number }> {
  const { data, error, status } = await supabase.from("groups").insert(payload).select("id");
  console.log("[API] createGroup status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { error: errMsg("createGroup", error), rows: 0 };
  return { rows: data?.length ?? 0 };
}

export async function updateGroupApi(id: string, payload: GroupUpdate): Promise<{ error?: string; rows?: number }> {
  const { data, error, status } = await supabase.from("groups").update(payload).eq("id", id).select("id");
  console.log("[API] updateGroup status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { error: errMsg("updateGroup", error), rows: 0 };
  return { rows: data?.length ?? 0 };
}

export async function createEventApi(payload: EventInsert): Promise<{ error?: string; rows?: number }> {
  const { data, error, status } = await supabase.from("events").insert(payload).select("id");
  console.log("[API] createEvent status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { error: errMsg("createEvent", error), rows: 0 };
  return { rows: data?.length ?? 0 };
}

export async function updateEventApi(id: string, payload: EventUpdate): Promise<{ error?: string; rows?: number }> {
  const { data, error, status } = await supabase.from("events").update(payload).eq("id", id).select("id");
  console.log("[API] updateEvent status:", status, "error:", error, "rows:", data?.length ?? 0);
  if (error) return { error: errMsg("updateEvent", error), rows: 0 };
  return { rows: data?.length ?? 0 };
}
