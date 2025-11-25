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

// Single place to toggle dev override behavior.
// For now, dev override is fully disabled to mimic production behavior.
// If you want to re-enable the dev role switch, change this to `return true;`
// or add your own environment-based logic here.
export function devSwitchEnabled() {
  return false;
}

export const useDevRoleStore = create<DevRoleState>((set) => ({
  serverRole: null,
  roleOverride: null,

  setServerRole: (role) => set({ serverRole: role ?? null }),

  setRoleOverride: async (role) => {
    if (!devSwitchEnabled()) return;
    set({ roleOverride: role ?? null });
    try {
      if (role) {
        await AsyncStorage.setItem(STORAGE_KEY, role);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  },

  clearOverride: async () => {
    if (!devSwitchEnabled()) return;
    set({ roleOverride: null });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));

// ---- Derived role (hook) ----
export function useEffectiveRole(): Role {
  const serverRole = useDevRoleStore((s) => s.serverRole);
  const roleOverride = useDevRoleStore((s) => s.roleOverride);

  // When dev switch is disabled, ignore any override and rely solely on serverRole.
  if (!devSwitchEnabled()) {
    return (serverRole as Role) ?? "attendee";
  }

  // When dev switch is enabled, allow override to take precedence.
  return (roleOverride as Role) ?? (serverRole as Role) ?? "attendee";
}

// one-shot restore at app start
export async function restoreDevRoleOverride() {
  if (!devSwitchEnabled()) return;
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
