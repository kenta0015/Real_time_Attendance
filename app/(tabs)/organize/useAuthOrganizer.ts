// app/(tabs)/organize/hooks/useAuthOrganizer.ts
import { useEffect, useState } from "react";
import { useUser } from "@supabase/auth-helpers-react";
import { supabase, isSupabaseConfigured } from "../../../lib/supabase";

export function useAuthOrganizer() {
  const user = useUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!isSupabaseConfigured) {
          setLoading(false);
          return;
        }
        const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id ?? null;
        if (mounted) setUserId(uid);
        if (!uid) {
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        console.log("[LOG] profiles.role query:", { uid, data, error });
        if (error) throw error;
        if (mounted) setIsOrganizer(data?.role === "organizer");
      } catch (e) {
        console.warn(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return {
    isConfigured: isSupabaseConfigured,
    userId,
    isOrganizer,
    loading,
  };
}
