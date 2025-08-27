import { Stack } from "expo-router";

export default function OrganizeOuterStack() {
  return (
    <Stack>
      <Stack.Screen name="events/[id]" options={{ title: "Event" }} />
    </Stack>
  );
}

