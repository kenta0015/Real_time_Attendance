import { Stack } from "expo-router";
import { View } from "react-native";
import DevRoleBadge from "../components/DevRoleBadge";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* このViewはタッチを遮らないように */}
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <Stack screenOptions={{ headerShown: false }} />
        <DevRoleBadge />
      </View>
    </SafeAreaProvider>
  );
}
