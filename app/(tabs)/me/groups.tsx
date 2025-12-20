// FILE: app/(tabs)/me/groups.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../../lib/supabase";

type MembershipRow = {
  group_id: string;
  role: "organizer" | "member";
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  invite_code?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

type GroupWithRole = GroupRow & { role: MembershipRow["role"] };

const INVITE_CODE_DEFAULT_LENGTH = 8;
// Excludes 0/O and 1/I to avoid confusion when people type the code.
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length: number = INVITE_CODE_DEFAULT_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return out;
}

function isUniqueViolation(err: any): boolean {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  return code === "23505" || msg.toLowerCase().includes("duplicate key");
}

function notify(msg: string) {
  if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

export default function MyGroupsScreen() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [groups, setGroups] = useState<GroupWithRole[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const an = (a.name ?? "").toLowerCase();
      const bn = (b.name ?? "").toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
  }, [groups]);

  const isEmpty = sortedGroups.length === 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userRes?.user?.id ?? null;

      if (!uid) {
        setUserId(null);
        setGroups([]);
        return;
      }
      setUserId(uid);

      const { data: memberships, error: memErr } = await supabase
        .from("group_members")
        .select("group_id, role")
        .eq("user_id", uid);

      if (memErr) throw memErr;

      const mems = (memberships ?? []) as MembershipRow[];
      if (mems.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = mems.map((m) => m.group_id);

      const { data: groupRows, error: groupErr } = await supabase
        .from("groups")
        .select("id, name, description, invite_code, created_at, created_by")
        .in("id", groupIds);

      if (groupErr) throw groupErr;

      const byId = new Map<string, GroupRow>();
      for (const g of (groupRows ?? []) as GroupRow[]) byId.set(g.id, g);

      const merged: GroupWithRole[] = mems
        .map((m) => {
          const g = byId.get(m.group_id);
          if (!g) return null;
          return { ...g, role: m.role };
        })
        .filter(Boolean) as GroupWithRole[];

      setGroups(merged);
    } catch (e: any) {
      Alert.alert("Load failed", String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
      notify("Refreshed");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const openCreate = useCallback(() => {
    setCreateName("");
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    if (creating) return;
    setCreateOpen(false);
  }, [creating]);

  const copyInviteCode = useCallback(async (code: string) => {
    const text = String(code ?? "").trim();
    if (!text) return;

    try {
      await Clipboard.setStringAsync(text);
      notify("Copied");
    } catch (e: any) {
      Alert.alert("Copy failed", String(e?.message ?? e));
    }
  }, []);

  const createGroup = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a group name.");
      return;
    }
    if (!userId) {
      Alert.alert("Not signed in", "Please sign in first.");
      return;
    }

    setCreating(true);
    try {
      let created: { id: string; invite_code?: string | null } | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const inviteCode = generateInviteCode(INVITE_CODE_DEFAULT_LENGTH);

        const { data, error } = await supabase
          .from("groups")
          .insert({
            name,
            description: null,
            created_by: userId,
            invite_code: inviteCode,
          })
          .select("id, invite_code")
          .single();

        if (error) {
          if (isUniqueViolation(error) && attempt < 4) continue;
          throw error;
        }

        created = (data as any) ?? null;
        break;
      }

      if (!created?.id) {
        throw new Error("Failed to generate a unique invite code. Please try again.");
      }

      const groupId = created.id;

      const { error: memErr } = await supabase.from("group_members").insert({
        group_id: groupId,
        user_id: userId,
        role: "organizer",
      });

      if (memErr) {
        // Best-effort rollback to avoid orphan group
        try {
          await supabase.from("groups").delete().eq("id", groupId);
        } catch {}
        throw memErr;
      }

      setCreateOpen(false);
      setCreateName("");

      notify("Group created");
      await load();

      const code = String(created.invite_code ?? "").trim();
      if (code) {
        Alert.alert("Invite code", code);
      }
    } catch (e: any) {
      Alert.alert("Create failed", String(e?.message ?? e));
    } finally {
      setCreating(false);
    }
  }, [createName, load, userId]);

  const renderItem = useCallback(
    ({ item }: { item: GroupWithRole }) => {
      const roleLabel = item.role === "organizer" ? "Organizer" : "Member";
      const code = (item.invite_code ?? "").trim();

      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <Text style={styles.groupName}>{item.name}</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>

          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

          {item.role === "organizer" && code ? (
            <View style={styles.inviteBox}>
              <Text style={styles.inviteLabel}>Invite Code</Text>

              <View style={styles.inviteRow}>
                <Text style={styles.inviteCode}>{code}</Text>

                <TouchableOpacity style={styles.copyBtn} onPress={() => copyInviteCode(code)} activeOpacity={0.85}>
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      );
    },
    [copyInviteCode]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>My Groups</Text>

        {!isEmpty ? (
          <TouchableOpacity style={styles.createBtnTop} onPress={openCreate} disabled={loading}>
            <Text style={styles.createBtnText}>+ Create</Text>
          </TouchableOpacity>
        ) : null}

        <FlatList
          data={sortedGroups}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={isEmpty ? styles.listContentEmpty : styles.listContent}
          onRefresh={onRefresh}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyBlock}>
                <TouchableOpacity style={styles.createBtnCenter} onPress={openCreate} disabled={loading}>
                  <Text style={styles.createBtnText}>+ Create</Text>
                </TouchableOpacity>

                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptySub}>Create your first group to get an invite code.</Text>
              </View>
            </View>
          }
        />

        <Modal visible={createOpen} transparent animationType="fade" onRequestClose={closeCreate}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Create Group</Text>

              <Text style={styles.modalLabel}>Group name</Text>
              <TextInput
                value={createName}
                onChangeText={setCreateName}
                placeholder="e.g. Morning Runners"
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!creating}
              />

              <View style={styles.modalHintBox}>
                <Text style={styles.modalHint}>
                  An invite code will be generated automatically. You can share it with members later.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={closeCreate} disabled={creating}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtnModal} onPress={createGroup} disabled={creating}>
                  <Text style={styles.primaryBtnText}>{creating ? "Creating..." : "Create"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0f17" },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  title: { color: "white", fontSize: 22, fontWeight: "800", textAlign: "center" },

  createBtnTop: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#2e6ef7",
  },
  createBtnCenter: {
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: "#2e6ef7",
  },
  createBtnText: { color: "white", fontSize: 15, fontWeight: "900" },

  listContent: { paddingBottom: 24, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1, paddingBottom: 24 },

  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyBlock: { alignItems: "center", paddingHorizontal: 16, width: "100%", maxWidth: 420 },

  emptyTitle: { color: "white", fontSize: 18, fontWeight: "800", marginTop: 18, marginBottom: 6 },
  emptySub: { color: "#98a2b3", fontSize: 13, textAlign: "center", maxWidth: 320 },

  card: {
    backgroundColor: "#101828",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2a3d",
    marginBottom: 12,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  groupName: { color: "white", fontSize: 16, fontWeight: "800", flexShrink: 1 },
  description: { color: "#cbd5e1", marginTop: 8, fontSize: 13, lineHeight: 18 },

  rolePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#182235",
    borderWidth: 1,
    borderColor: "#22314a",
  },
  roleText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },

  inviteBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#22314a",
  },
  inviteLabel: { color: "#98a2b3", fontSize: 11, fontWeight: "700" },
  inviteRow: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  inviteCode: { color: "white", fontSize: 16, fontWeight: "900", letterSpacing: 1, flexShrink: 1 },

  copyBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#1a2233",
    borderWidth: 1,
    borderColor: "#22314a",
  },
  copyBtnText: { color: "white", fontSize: 13, fontWeight: "800" },

  primaryBtnModal: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#2e6ef7",
    minWidth: 110,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontSize: 14, fontWeight: "800" },

  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#1a2233",
    minWidth: 110,
    alignItems: "center",
  },
  secondaryBtnText: { color: "white", fontSize: 14, fontWeight: "700" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: "#101828",
    borderWidth: 1,
    borderColor: "#1f2a3d",
    padding: 16,
  },
  modalTitle: { color: "white", fontSize: 18, fontWeight: "900", marginBottom: 12 },
  modalLabel: { color: "#cbd5e1", fontSize: 12, fontWeight: "800", marginBottom: 8 },

  input: {
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "white",
    fontSize: 14,
  },

  modalHintBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#22314a",
  },
  modalHint: { color: "#98a2b3", fontSize: 12, lineHeight: 17 },

  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
});
