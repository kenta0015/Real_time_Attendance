// components/ToastHost.tsx
// Minimal in-app toast (no deps). Listens to showToast() events and fades in/out.

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, Platform } from "react-native";
import { subscribeToast, ToastPayload } from "../lib/toast";

export default function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = subscribeToast((p: ToastPayload) => {
      // Clear pending
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setMsg(p.message);
      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Schedule fade out
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setMsg(null);
        });
        hideTimer.current = null;
      }, Math.max(1200, p.duration ?? 2200));
    });
    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity]);

  if (!msg) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity,
            // slight move-up on web to avoid taskbars, etc.
            bottom: Platform.select({ web: 16, default: 24 }),
          },
        ]}
      >
        <View style={styles.card}>
          <Text style={styles.text}>{msg}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    maxWidth: 720,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.9)", // slate-900/90
  },
  text: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});




