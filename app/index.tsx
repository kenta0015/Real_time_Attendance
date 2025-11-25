// app/index.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  DeviceEventEmitter,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import {
  useDevRoleStore,
  devSwitchEnabled,
  restoreDevRoleOverride,
  type Role,
} from "../stores/devRole";

type UserProfileRow = {
  user_id: string;
  display_name?: string | null;
  role?: Role | null;
};

const ROLE_KEY = "rta_dev_role";

async function syncRoleSideEffects(role: Role) {
  try {
    await AsyncStorage.setItem(ROLE_KEY, role);
  } catch (e) {
    console.warn(
      "[index] failed to persist role to AsyncStorage:",
      String(e)
    );
  }

  try {
    DeviceEventEmitter.emit("rta_role_changed", { role });
  } catch (e) {
    console.warn("[index] failed to emit rta_role_changed:", String(e));
  }
}

export default function Index() {
  const router = useRouter();
  const setServerRole = useDevRoleStore((s) => s.setServerRole);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      console.info("[index] bootstrap start");

      try {
        // 1) Check auth session
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[index] getSession error:", error.message);
        }

        const session = data?.session ?? null;
        const uid = session?.user?.id ?? null;

        if (!uid) {
          console.info("[index] no session user -> /join");
          if (!mounted) return;

          setServerRole(null);
          router.replace("/join");
          return;
        }

        // 2) Load user_profile (role + display_name)
        const { data: profile, error: profileError } = await supabase
          .from("user_profile")
          .select("user_id, display_name, role")
          .eq("user_id", uid)
          .maybeSingle<UserProfileRow>();

        if (profileError) {
          console.warn(
            "[index] user_profile query error:",
            profileError.message
          );
        }

        // 2a) No profile row -> first-time user -> /register
        if (!profile) {
          console.info("[index] user_profile missing -> /register");
          if (!mounted) return;

          setServerRole(null);
          router.replace("/register");
          return;
        }

        // 2b) Missing display_name -> incomplete profile -> /register
        const hasDisplayName =
          typeof profile.display_name === "string" &&
          profile.display_name.trim().length > 0;

        if (!hasDisplayName) {
          console.info(
            "[index] user_profile missing display_name -> /register"
          );
          if (!mounted) return;

          setServerRole(null);
          router.replace("/register");
          return;
        }

        // 2c) Invalid or missing role -> send to /register to complete setup
        if (profile.role !== "organizer" && profile.role !== "attendee") {
          console.info("[index] user_profile has invalid role -> /register");
          if (!mounted) return;

          setServerRole(null);
          router.replace("/register");
          return;
        }

        const effectiveRole: Role = profile.role;
        console.info("[index] user_profile found. role =", effectiveRole);

        if (!mounted) return;

        // 3) Sync role to local dev-role infra (AsyncStorage + event)
        await syncRoleSideEffects(effectiveRole);

        // 4) Push role into global store (source of truth = Supabase)
        setServerRole(effectiveRole);

        // 5) In dev, restore local override (optional)
        if (devSwitchEnabled()) {
          restoreDevRoleOverride().catch((e) => {
            console.warn(
              "[index] restoreDevRoleOverride error:",
              String(e)
            );
          });
        }

        // 6) Go to main tabs (Events as initial)
        console.info(
          "[index] redirect -> /(tabs)/events with role =",
          effectiveRole
        );
        router.replace("/(tabs)/events");
      } catch (e) {
        console.warn("[index] bootstrap fatal error:", String(e));
        if (!mounted) return;

        setServerRole(null);
        router.replace("/join");
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [router, setServerRole]);

  if (!booting) {
    // This screen immediately redirects; no actual UI once boot is done.
    return null;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
