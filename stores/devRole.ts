import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Role = "attendee" | "organizer";

type DevRoleState = {
  serverRole: Role | null;
  roleOverride: Role | null;
  setServerRole: (role: Role | null | undefined) => void;
  setRoleOverride: (role: Role | null) => Promise<void>;
  clearOverride: () => Promise<void>;
};

const STORAGE_KEY = "@dev.roleOverride";
const ENABLE_SWITCH =
  process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH === "true" ||
  (__DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEV_SWITCH !== "false");

export const useDevRoleStore = create<DevRoleState>((set) => ({
  serverRole: null,
  roleOverride: null,

  setServerRole: (role) => set({ serverRole: role ?? null }),

  setRoleOverride: async (role) => {
    if (!ENABLE_SWITCH) return;
    set({ roleOverride: role ?? null });
    try {
      if (role) await AsyncStorage.setItem(STORAGE_KEY, role);
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  clearOverride: async () => {
    if (!ENABLE_SWITCH) return;
    set({ roleOverride: null });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

export function devSwitchEnabled() {
  return ENABLE_SWITCH;
}

// ---- Derived role (hook) ----
export function useEffectiveRole(): Role {
  const serverRole = useDevRoleStore((s) => s.serverRole);
  const roleOverride = useDevRoleStore((s) => s.roleOverride);
  if (!ENABLE_SWITCH) return (serverRole as Role) ?? "attendee";
  return (roleOverride as Role) ?? (serverRole as Role) ?? "attendee";
}

// one-shot restore at app start
export async function restoreDevRoleOverride() {
  if (!ENABLE_SWITCH) return;
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val === "attendee" || val === "organizer") {
      await useDevRoleStore.getState().setRoleOverride(val);
    }
  } catch {
    // ignore
  }
}

// ---- Convenience custom hooks (use* names) ----
export function useIsOrganizer() {
  return useEffectiveRole() === "organizer";
}
export function useIsAttendee() {
  return useEffectiveRole() === "attendee";
}
