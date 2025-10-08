// app/(tabs)/organize/events/[id]/invite.tsx
import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Share,
  Alert,
  ToastAndroid,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as LinkingExpo from "expo-linking";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import { supabase } from "../../../../../lib/supabase";
import { buildICS, downloadICSWeb } from "../../../../../lib/ics";
import { noti, notiAvailable, ensureDefaultHandler, requestPerms } from "@/lib/safeNoti";

// Common UI
import Button from "../../../../ui/Button";
import Card from "../../../../ui/Card";

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
  const ok =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return ok ? id : null;
}

export default function InviteScreen() {
  const eventId = getEventIdParam();
  const [row, setRow] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!eventId);

  const notify = (m: string) =>
    Platform.OS === "android"
      ? ToastAndroid.show(m, ToastAndroid.SHORT)
      : Alert.alert("", m);

  useEffect(() => {
    if (notiAvailable) ensureDefaultHandler();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!eventId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id,title,venue_lat,venue_lng,venue_radius_m,start_time_utc,end_time_utc,venue_url"
        )
        .eq("id", eventId)
        .maybeSingle();
      if (!mounted) return;
      if (error) Alert.alert("Load failed", error.message);
      else setRow((data as any) ?? null);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const { icsText, joinUrl } = useMemo(() => {
    if (!row || !eventId) return { icsText: "", joinUrl: "" };
    const startsAt =
      row.start_time_utc ??
      new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt =
      row.end_time_utc ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

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

  const onShareIcs = async () => {
    if (!icsText) return;

    if (Platform.OS === "web") {
      downloadICSWeb(filename, icsText);
      return;
    }

    try {
      const FS = FileSystem as unknown as {
        cacheDirectory?: string | null;
        documentDirectory?: string | null;
        writeAsStringAsync: typeof FileSystem.writeAsStringAsync;
      };
      const baseDir = FS.cacheDirectory ?? FS.documentDirectory ?? "";
      const uri = baseDir + filename;

      await FS.writeAsStringAsync(uri, icsText);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/calendar",
          dialogTitle: "Share calendar (.ics)",
          UTI: "com.apple.ical.ics",
        });
        return;
      }

      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          subject: `RTA invite: ${row?.title ?? "Event"}`,
          body: "ICS attached.",
          attachments: [uri],
        });
        return;
      }

      await Share.share({ message: icsText, title: filename });
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? String(e));
    }
  };

  const copyJoinUrl = async () => {
    try {
      if (!joinUrl) return;
      if (Platform.OS === "web" && "clipboard" in navigator) {
        await (navigator as any).clipboard.writeText(joinUrl);
      } else {
        const Clipboard = (await import("expo-clipboard")) as any;
        await Clipboard.setStringAsync?.(joinUrl);
      }
      notify("Copied to clipboard");
    } catch (e: any) {
      Alert.alert("Copy failed", e?.message ?? String(e));
    }
  };

  async function ensurePerms() {
    if (!notiAvailable) {
      Alert.alert("Unsupported", "Notifications on Android require a development build (Expo Go not supported).");
      return false;
    }
    const ok = await requestPerms();
    if (!ok) Alert.alert("Permission", "Notifications permission is required.");
    return ok;
  }

  const testImmediate = async () => {
    if (!(await ensurePerms())) return;
    const N = await noti();
    await N?.scheduleNotificationAsync({
      content: {
        title: "RTA Test",
        body: "Immediate notification (trigger=null)",
        data: { kind: "immediate" },
      },
      trigger: null,
    });
  };

  const testIn10s = async () => {
    if (!(await ensurePerms())) return;
    const N = await noti();
    await N?.scheduleNotificationAsync({
      content: { title: "RTA Test", body: "Scheduled in 10s (TIME_INTERVAL)" },
      trigger: {
        type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        channelId: Platform.OS === "android" ? "default" : undefined,
      },
    });
    Alert.alert("Scheduled", "Will fire in ~10s.");
  };

  const scheduleReminder = async () => {
    if (!row) return;
    if (!(await ensurePerms())) return;

    const startsAt =
      row.start_time_utc ??
      new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const fire = new Date(startsAt);
    fire.setMinutes(fire.getMinutes() - 30);

    const now = new Date();
    if (fire.getTime() < now.getTime() + 60 * 1000)
      fire.setTime(now.getTime() + 60 * 1000);

    const N = await noti();
    await N?.scheduleNotificationAsync({
      content: {
        title: row.title ?? "Event",
        body: "Starts in 30 minutes.",
        data: { eventId },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: fire,
        channelId: Platform.OS === "android" ? "default" : undefined,
      },
    });
    Alert.alert("Scheduled", "App reminder set (≈1–3 min drift on Android is normal).");
  };

  if (!eventId) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Card>
          <Text style={styles.err}>Missing or invalid event id.</Text>
          <Text style={styles.help}>Open via Organizer → event → Invite.</Text>
          <Text style={styles.code}>/organize/events/&lt;YOUR_EVENT_ID&gt;/invite</Text>
        </Card>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Card>
          <Text style={styles.meta}>Loading…</Text>
        </Card>
      </View>
    );
  }
  if (!row) {
    return (
      <View style={styles.container}>
        <Text style={styles.h1}>Invite</Text>
        <Card>
          <Text style={styles.err}>Event not found.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Invite</Text>
      <Text style={styles.meta}>{row.title ?? "—"}</Text>

      {/* Join URL */}
      <Card style={{ gap: 8 }}>
        <Text style={styles.label}>Join URL</Text>
        <View style={styles.urlRow}>
          <Text style={[styles.value, { flex: 1 }]} numberOfLines={1} selectable>
            {joinUrl}
          </Text>
          <Button title="Copy" onPress={copyJoinUrl} variant="primary" size="sm" />
        </View>
      </Card>

      {/* ICS / Test actions */}
      <Card style={{ gap: 10 }}>
        <Button
          title={Platform.OS === "web" ? "Download .ics" : "Share .ics (attach)"}
          onPress={onShareIcs}
          variant="primary"
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            title="Test: Immediate"
            onPress={testImmediate}
            variant="outline"
            style={{ flex: 1 }}
            disabled={!notiAvailable}
          />
          <Button
            title="Test: in 10s"
            onPress={testIn10s}
            variant="outline"
            style={{ flex: 1 }}
            disabled={!notiAvailable}
          />
        </View>
        <Button
          title={notiAvailable ? "Add App Reminder (30m before)" : "Add App Reminder (dev build required)"}
          onPress={scheduleReminder}
          variant="primary"
          disabled={!notiAvailable}
        />
        <View style={styles.note}>
          <Text style={styles.noteText}>
            ICS has 30m VALARM & deep link. App reminders use local notifications.
            On Android Expo Go, notifications are unavailable — use a development build.
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: "#F7F8FA" },
  h1: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  meta: { color: "#6B7280", marginBottom: 2 },

  label: { color: "#6B7280", fontSize: 12 },
  value: { color: "#0F172A", fontWeight: "700" },

  urlRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  err: { color: "#B00020" },
  help: { color: "#6B7280" },
  code: {
    color: "#0F172A",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },

  note: { backgroundColor: "#111317", borderRadius: 10, padding: 10, marginTop: 6 },
  noteText: { color: "#97a0aa", fontSize: 12 },
});
