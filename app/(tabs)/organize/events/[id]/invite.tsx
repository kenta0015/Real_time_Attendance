// app/(tabs)/organize/events/[id]/invite.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Share, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as LinkingExpo from "expo-linking";
import * as Notifications from "expo-notifications";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import { supabase } from "../../../../../lib/supabase";
import { buildICS, downloadICSWeb } from "../../../../../lib/ics";

// --- Notification handler (typed) ---
const notificationBehavior: Notifications.NotificationBehavior = {
  shouldShowAlert: true,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: true,
  shouldShowList: true,
  priority: Notifications.AndroidNotificationPriority.DEFAULT,
};
Notifications.setNotificationHandler({
  handleNotification: async () => notificationBehavior,
});

type EventRow = {
  id: string;
  title: string;
  venue_lat: number | null;
  venue_lng: number | null;
  venue_radius_m: number | null;
  start_time_utc?: string | null;
  end_time_utc?: string | null;
  venue_url?: string | null;
};

function getEventIdParam(): string | null {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string") return null;
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return ok ? id : null;
}

export default function InviteScreen() {
  const eventId = getEventIdParam();
  const [row, setRow] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!eventId);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!eventId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,venue_lat,venue_lng,venue_radius_m,start_time_utc,end_time_utc,venue_url")
        .eq("id", eventId)
        .maybeSingle();
      if (!mounted) return;
      if (error) Alert.alert("Load failed", error.message);
      else setRow(data as any);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [eventId]);

  // --- build .ics & Join URL ---
  const { icsText, joinUrl } = useMemo(() => {
    if (!row || !eventId) return { icsText: "", joinUrl: "" };
    const startsAt = row.start_time_utc ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt   = row.end_time_utc   ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    // 本番スキーム rta:// 固定
    const url = LinkingExpo.createURL(`/events/${eventId}`, { scheme: "rta" });

    const text = buildICS({
      id: row.id,
      title: row.title ?? "Event",
      startUtc: startsAt,
      endUtc: endsAt,
      venueLat: row.venue_lat ?? undefined,
      venueLng: row.venue_lng ?? undefined,
      url,
      alarmMinutes: 30,
    });
    return { icsText: text, joinUrl: url };
  }, [row, eventId]);

  const filename = `rta-event-${eventId ?? "unknown"}.ics`;

  // === ここが“添付ファイル共有”版 ===
  const onShareIcs = async () => {
    if (!icsText) return;

    if (Platform.OS === "web") {
      // Web は従来どおりファイルでダウンロード
      downloadICSWeb(filename, icsText);
      return;
    }

    try {
      // 一時ファイルに .ics を書く（アプリのキャッシュ領域）
      const uri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, icsText);

      // 共有 UI が使えるなら、Gmail などに“添付”で渡せる
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/calendar",
          dialogTitle: "Share calendar (.ics)",
          UTI: "com.apple.ical.ics", // iOS用ヒント
        });
        return;
      }

      // 共有が使えない環境では、直接メール作成にフォールバック
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          subject: `RTA invite: ${row?.title ?? "Event"}`,
          body: "ICS attached.",
          attachments: [uri],
        });
        return;
      }

      // どちらも不可（まず無い想定）→ 旧テキスト共有にフォールバック
      await Share.share({ message: icsText, title: filename });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? String(e));
    }
  };

  async function ensurePerms() {
    if (isWeb) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission", "Notifications permission is required."); return false; }
    return true;
  }

  const testImmediate = async () => {
    if (isWeb) { Alert.alert("Web unsupported"); return; }
    if (!(await ensurePerms())) return;
    await Notifications.presentNotificationAsync({
      title: "RTA Test",
      body: "Immediate notification (presentNotificationAsync)",
      data: { kind: "immediate" },
    });
  };

  const testIn10s = async () => {
    if (isWeb) { Alert.alert("Web unsupported"); return; }
    if (!(await ensurePerms())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: "RTA Test", body: "Scheduled in 10s (TIME_INTERVAL)" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        channelId: Platform.OS === "android" ? "default" : undefined,
      },
    });
    Alert.alert("Scheduled", "Will fire in ~10s.");
  };

  const scheduleReminder = async () => {
    if (isWeb) { Alert.alert("Web unsupported"); return; }
    if (!row) return;
    if (!(await ensurePerms())) return;

    const startsAt = row.start_time_utc ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fire = new Date(startsAt);
    fire.setMinutes(fire.getMinutes() - 30);

    const now = new Date();
    if (fire.getTime() < now.getTime() + 60 * 1000) fire.setTime(now.getTime() + 60 * 1000);

    await Notifications.scheduleNotificationAsync({
      content: { title: row.title ?? "Event", body: "Starts in 30 minutes.", data: { eventId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
        channelId: Platform.OS === "android" ? "default" : undefined,
      },
    });
    Alert.alert("Scheduled", "App reminder set (≈1–3 min drift is normal on Android).");
  };

  if (!eventId) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Text style={styles.err}>Missing or invalid event id.</Text>
        <Text style={styles.help}>Open via Organizer → event → Invite.</Text>
        <Text style={styles.code}>/organize/events/&lt;YOUR_EVENT_ID&gt;/invite</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Text style={styles.meta}>Loading…</Text>
      </View>
    );
  }
  if (!row) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Text style={styles.err}>Event not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Invite</Text>
      <Text style={styles.meta}>{row.title ?? "—"}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Join URL</Text>
        <Text style={styles.value}>{joinUrl}</Text>
      </View>

      <TouchableOpacity onPress={onShareIcs} style={styles.btn}>
        <Text style={styles.btnText}>
          {Platform.OS === "web" ? "Download .ics" : "Share .ics (attach)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={testImmediate} disabled={isWeb} style={[styles.btn, { backgroundColor: isWeb ? "#3b82f680" : "#8b5cf6" }]}>
        <Text style={styles.btnText}>Test: Immediate</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={testIn10s} disabled={isWeb} style={[styles.btn, { backgroundColor: isWeb ? "#3b82f680" : "#f59e0b" }]}>
        <Text style={styles.btnText}>Test: in 10s</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={scheduleReminder} disabled={isWeb} style={[styles.btn, { backgroundColor: isWeb ? "#3b82f680" : "#22c55e" }]}>
        <Text style={styles.btnText}>{isWeb ? "Add App Reminder (mobile only)" : "Add App Reminder (30m before)"}</Text>
      </TouchableOpacity>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          ICS has 30m VALARM & deep link. App reminders are local; push is not required.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#0b0b0c" },
  h1: { fontSize: 22, fontWeight: "700", color: "#fff" },
  meta: { color: "#bfc3c9" },
  err: { color: "#ff9999" },
  help: { color: "#c7ccd2" },
  code: { color: "#e8ebf0", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  card: { backgroundColor: "#17181a", borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: "#232428" },
  label: { color: "#9aa1ac", fontSize: 12 },
  value: { color: "#e8ebf0", fontWeight: "600" },
  btn: { backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  note: { backgroundColor: "#111317", borderRadius: 8, padding: 10 },
  noteText: { color: "#97a0aa", fontSize: 12 },
});
