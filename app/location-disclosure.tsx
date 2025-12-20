// app/location-disclosure.tsx
import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Button from "./ui/Button";
import { COLORS, SPACING, RADIUS } from "@ui/theme";

type Params = {
  next?: string | string[];
};

const DISCLOSURE_KEY = "@geoattendance.locationDisclosure.v1";

export default function LocationDisclosureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const targetPath = useMemo(() => {
    const raw = params.next;
    const value =
      typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (!value || value.length === 0) return "/";
    return value;
  }, [params.next]);

  const navigateBack = useCallback(() => {
    router.replace(targetPath);
  }, [router, targetPath]);

  const handleContinue = useCallback(async () => {
    try {
      await AsyncStorage.setItem(DISCLOSURE_KEY, "accepted");
    } catch {
      // If persisting fails, we still proceed with navigation.
    }
    navigateBack();
  }, [navigateBack]);

  const handleCancel = useCallback(() => {
    navigateBack();
  }, [navigateBack]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Location access for attendance verification</Text>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.bodyText}>
            This app collects your location to verify on-site attendance and to detect
            entry and exit around event venues.
          </Text>
          <Text style={styles.bodyText}>
            Location data may be accessed in the background, even when the app is closed
            or not in use, so that your attendance can be recorded reliably.
          </Text>
          <Text style={styles.bodyText}>
            We do not use your location data for advertising or marketing purposes.
          </Text>
          <Text style={styles.bodyText}>
            You can change this permission later in your device settings.
          </Text>
        </ScrollView>

        <View style={styles.buttonGroup}>
          <Button
            title="Continue"
            variant="primary"
            size="md"
            fullWidth
            onPress={handleContinue}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            fullWidth
            onPress={handleCancel}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: SPACING.lg,
    justifyContent: "center",
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: "85%",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  bodyScroll: {
    marginBottom: SPACING.lg,
  },
  bodyContent: {
    paddingBottom: SPACING.sm,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  buttonGroup: {
    marginTop: SPACING.sm,
  },
  buttonSpacer: {
    height: SPACING.sm,
  },
});
