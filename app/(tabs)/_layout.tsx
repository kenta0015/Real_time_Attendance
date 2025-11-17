import { Tabs } from "expo-router";
import { Platform, DeviceEventEmitter } from "react-native";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as KeepAwake from "expo-keep-awake";
import HardBoundary from "../../components/HardBoundary";

export const unstable_settings = { initialRouteName: "events" };

const ROLE_KEY = "rta_dev_role";
const enableDev = 
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "1";

console.log("[tabs/_layout] module loaded. enableDev =", enableDev);

function useDevRole(): "organizer" | "attendee" {
  const [role, setRole] = useState<"organizer" | "attendee">("organizer");

  useEffect(() => {
    console.log("[useDevRole] effect start. enableDev =", enableDev);

    // In production (enableDev === false), always force "organizer"
    if (!enableDev) {
      console.log("[useDevRole] enableDev is false. Forcing role=organizer");
      setRole("organizer");
      return;
    }

    const applyRoleFromValue = (value: unknown) => {
      console.log("[useDevRole] applyRoleFromValue payload =", value);

      let next: unknown = value;

      // Support payloads like { role: "attendee" }
      if (next && typeof next === "object") {
        const obj = next as { role?: unknown };
        if (typeof obj.role === "string") {
          console.log("[useDevRole] detected object payload with role field:", obj.role);
          next = obj.role;
        }
      }

      if (next === "attendee" || next === "organizer") {
        console.log("[useDevRole] accepting role =", next);
        AsyncStorage.setItem(ROLE_KEY, next as string).catch((e) => {
          console.log("[useDevRole] AsyncStorage.setItem error:", String(e));
        });
        setRole(next);
        return;
      }

      console.log(
        "[useDevRole] unknown payload. Reloading from AsyncStorage. payload =",
        next
      );

      // Fallback: reload from AsyncStorage if payload is missing or unknown
      (async () => {
        try {
          const stored = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
          console.log("[useDevRole] fallback read stored =", stored);
          if (stored === "attendee" || stored === "organizer") {
            setRole(stored);
          } else {
            setRole("organizer");
          }
        } catch (e) {
          console.log("[useDevRole] fallback read error:", String(e));
          setRole("organizer");
        }
      })();
    };

    // Initial load from AsyncStorage
    const read = async () => {
      try {
        const v = (await AsyncStorage.getItem(ROLE_KEY)) ?? "organizer";
        console.log("[useDevRole] initial AsyncStorage ROLE_KEY =", v);
        applyRoleFromValue(v);
      } catch (e) {
        console.log("[useDevRole] initial read error:", String(e));
        setRole("organizer");
      }
    };
    read();

    // Newer event name used across app
    console.log("[useDevRole] subscribing to rta_role_changed");
    const subChanged = DeviceEventEmitter.addListener(
      "rta_role_changed",
      (payload) => {
        console.log("[useDevRole] event rta_role_changed received. payload =", payload);
        applyRoleFromValue(payload);
      }
    );

    // Backward compatibility for legacy emitters
    console.log("[useDevRole] subscribing to rta:set-role");
    const subLegacy = DeviceEventEmitter.addListener(
      "rta:set-role",
      (payload) => {
        console.log("[useDevRole] event rta:set-role received. payload =", payload);
        applyRoleFromValue(payload);
      }
    );

    return () => {
      console.log("[useDevRole] cleanup: removing role listeners");
      subChanged.remove();
      subLegacy.remove();
    };
  }, []);

  useEffect(() => {
    console.log("[useDevRole] role state changed =>", role, "enableDev =", enableDev);
  }, [role]);

  return role;
}

// --- keep-awake (fail-safe) ---
async function safeKeepAwake() {
  try {
    // @ts-ignore different APIs across SDKs
    if ((KeepAwake as any).activateKeepAwakeAsync) {
      await (KeepAwake as any).activateKeepAwakeAsync();
    } else if ((KeepAwake as any).activate) {
      await (KeepAwake as any).activate();
    }
  } catch (e) {
    console.log("[keep-awake] skip:", String(e));
  }
}

export default function TabLayout() {
  const role = useDevRole();

  useEffect(() => {
    console.log("[TabLayout] mounted. enableDev =", enableDev);
    // prevent "Uncaught (in promise) Unable to activate keep awake"
    safeKeepAwake().catch((e) => {
      console.log("[keep-awake] skip(caller):", String(e));
    });
  }, []);

  useEffect(() => {
    console.log("[TabLayout] render with role =", role, "enableDev =", enableDev);
  }, [role]);

  return (
    <HardBoundary>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#2563eb",
          tabBarInactiveTintColor: "#94a3b8",
          tabBarStyle: {
            borderTopColor: "#e5e7eb",
            borderTopWidth: Platform.OS === "android" ? 0.4 : 0.2,
          },
        }}
      >
        {/* Visible tabs (match immediate children) */}
        <Tabs.Screen
          name="events" // app/(tabs)/events.tsx
          options={{
            title: "History",
            href: { pathname: "/events" },
          }}
        />
        <Tabs.Screen
          name="organize/index" // app/(tabs)/organize/index.tsx
          options={{
            title: role === "attendee" ? "Organize (locked)" : "Organize",
            href:
              role === "attendee" && !enableDev
                ? null
                : { pathname: "/organize" },
          }}
        />
        <Tabs.Screen
          name="profile/index" // app/(tabs)/profile/index.tsx
          options={{
            title: "Profile",
            href: { pathname: "/profile" },
          }}
        />
        <Tabs.Screen
          name="debug" // app/(tabs)/debug.tsx
          options={{
            title: "Debug",
            href: enableDev ? { pathname: "/debug" } : null,
          }}
        />

        {/* Hidden entries (must match router children exactly) */}
        <Tabs.Screen name="me/events" options={{ href: null }} />
        <Tabs.Screen name="me/groups" options={{ href: null }} />
        <Tabs.Screen name="organize/location-test" options={{ href: null }} />
        <Tabs.Screen name="organize/admin" options={{ href: null }} />
        <Tabs.Screen
          name="organize/admin/[eventId]/live"
          options={{ href: null }}
        />
        <Tabs.Screen name="organize/events/[id]" options={{ href: null }} />
        <Tabs.Screen
          name="organize/events/[id]/invite"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="organize/events/[id]/qr"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="organize/events/[id]/settings"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="organize/events/[id]/checkin"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="organize/events/[id]/live"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="organize/events/[id]/scan"
          options={{ href: null }}
        />
        <Tabs.Screen name="screens/EventsList" options={{ href: null }} />
      </Tabs>
    </HardBoundary>
  );
}

