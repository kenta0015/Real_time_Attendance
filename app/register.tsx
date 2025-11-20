// app/register.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useDevRoleStore, type Role } from "../stores/devRole";

type UserProfileRow = {
  user_id: string;
  display_name?: string | null;
  role?: Role | null;
};

export default function RegisterScreen() {
  const router = useRouter();
  const setServerRole = useDevRoleStore((s) => s.setServerRole);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      console.info("[register] bootstrap start");

      try {
        // 1) Check auth session
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn("[register] getSession error:", error.message);
        }

        const session = data?.session ?? null;
        const uid = session?.user?.id ?? null;

        if (!uid) {
          console.info("[register] no session user -> /join");
          if (!mounted) return;
          router.replace("/join");
          return;
        }

        if (!mounted) return;
        setUserId(uid);

        // 2) Load existing user_profile (if any) to prefill
        const { data: profile, error: profileError } = await supabase
          .from("user_profile")
          .select("user_id, display_name, role")
          .eq("user_id", uid)
          .maybeSingle<UserProfileRow>();

        if (profileError) {
          console.warn(
            "[register] user_profile query error:",
            profileError.message
          );
        }

        if (profile) {
          const name = profile.display_name ?? "";
          setDisplayName(name);

          if (profile.role === "organizer" || profile.role === "attendee") {
            setSelectedRole(profile.role);
          }
        }
      } catch (e) {
        console.warn("[register] bootstrap fatal error:", String(e));
        if (!mounted) return;
        router.replace("/join");
        return;
      } finally {
        if (mounted) {
          setCheckingAuth(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [router]);

  const isValid =
    displayName.trim().length > 0 &&
    (selectedRole === "organizer" || selectedRole === "attendee");

  const handleSave = async () => {
    if (!userId) {
      console.warn("[register] handleSave called without userId");
      return;
    }

    const name = displayName.trim();
    if (!name || !selectedRole) {
      Alert.alert(
        "Missing information",
        "Please enter your name and select a role."
      );
      return;
    }

    setSaving(true);
    try {
      console.info("[register] saving profile", {
        userId,
        role: selectedRole,
      });

      const { error } = await supabase
        .from("user_profile")
        .upsert(
          {
            user_id: userId,
            display_name: name,
            role: selectedRole,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.warn("[register] upsert error:", error.message);
        Alert.alert(
          "Save failed",
          "Could not save your profile. Please try again."
        );
        return;
      }

      // Update global role (source of truth = Supabase, but we mirror it locally)
      setServerRole(selectedRole);
      console.info("[register] saved -> /(tabs) with role =", selectedRole);
      router.replace("/(tabs)");
    } catch (e) {
      console.warn("[register] save fatal error:", String(e));
      Alert.alert(
        "Save failed",
        "An unexpected error occurred. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Register</Text>
        <Text style={styles.body}>
          Set your display name and choose how you primarily use this app.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Kenta"
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            <RoleButton
              label="Organizer"
              active={selectedRole === "organizer"}
              onPress={() => setSelectedRole("organizer")}
            />
            <RoleButton
              label="Attendee"
              active={selectedRole === "attendee"}
              onPress={() => setSelectedRole("attendee")}
            />
          </View>
        </View>

        <Pressable
          style={[styles.button, (!isValid || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!isValid || saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Save and continue</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type RoleButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function RoleButton({ label, active, onPress }: RoleButtonProps) {
  return (
    <Pressable
      style={[styles.roleButton, active && styles.roleButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.roleButtonText, active && styles.roleButtonTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: "#444444",
    lineHeight: 20,
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: "#555555",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  roleButtonActive: {
    borderColor: "#2563eb",
    backgroundColor: "#e0edff",
  },
  roleButtonText: {
    fontSize: 14,
    color: "#444444",
  },
  roleButtonTextActive: {
    color: "#1d4ed8",
    fontWeight: "600",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "500",
  },
});
