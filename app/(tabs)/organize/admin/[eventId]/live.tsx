import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function LegacyLiveRedirect() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const router = useRouter();
  useEffect(() => {
    if (eventId) router.replace(`/organize/events/${eventId}/live`);
    else router.replace("/(tabs)/organize");
  }, [eventId, router]);
  return null;
}

