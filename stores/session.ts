import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const KEY = "rta_guest_id";

function uuidv4() {
  // Simple UUID without external deps
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns or creates a stable local guest id.
 */
export async function getGuestId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const id = uuidv4();
  await AsyncStorage.setItem(KEY, id);
  return id;
}

/**
 * Returns the current Supabase session user id or null.
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the "effective" user id used everywhere in the app:
 * 1. Signed-in session user id (if exists)
 * 2. Otherwise fallback to guest id
 */
export async function getEffectiveUserId(): Promise<string> {
  const session = await getSessionUserId();
  if (session) return session;
  return await getGuestId();
}

/**
 * Hook that exposes the effective user id and keeps it synced with auth changes.
 * Returns null until first load completes.
 */
export function useEffectiveUserId(): string | null {
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      const sessionUid = await getSessionUserId();
      if (!mounted) return;
      if (sessionUid) {
        setUid(sessionUid);
      } else {
        const guestUid = await getGuestId();
        if (!mounted) return;
        setUid(guestUid);
      }
    }

    loadInitial().catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      const sessionUid = sess?.user?.id ?? null;
      if (sessionUid) {
        setUid(sessionUid);
      } else {
        getGuestId()
          .then((g) => {
            if (mounted) setUid(g);
          })
          .catch(() => {});
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return uid;
}



