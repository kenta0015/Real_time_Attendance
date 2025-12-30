// lib/ui.tsx
import React, { ReactNode } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
  Platform,
} from "react-native";

/** ========== Design Tokens ========== */
export const RTA = {
  color: {
    bg: "#0b0b0c",           // 画面のベース（暗）
    card: "#111317",         // カード面
    cardBorder: "#232428",   // カード枠
    text: "#e8ebf0",
    textMuted: "#9aa1ac",
    primary: "#2563EB",      // Blue-600
    primaryHover: "#1D4ED8", // Blue-700
    outline: "#3b82f6",
    success: "#16a34a",
    warn: "#f59e0b",
    error: "#ef4444",
    neutral: "#334155",
  },
  radius: {
    md: 12,
    lg: 16,    // だいたい “2xl” 相当
    pill: 999,
  },
};

/** 影：iOS/Web は shadow〜、Android は elevation */
function shadow(level: 0 | 1 | 2 = 1): ViewStyle {
  if (level === 0) return {};
  const opacity = level === 1 ? 0.12 : 0.18;
  const radius = level === 1 ? 8 : 12;
  const y = level === 1 ? 3 : 6;
  return Platform.select({
    android: { elevation: level === 1 ? 2 : 4 },
    default: {
      shadowColor: "#000",
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
    },
  }) as ViewStyle;
}

/** ========== Card ========== */
export function RtaCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** ========== Button ========== */
type BtnVariant = "primary" | "outline" | "ghost";
export function RtaButton({
  title,
  onPress,
  disabled,
  variant = "primary",
  style,
  textStyle,
}: {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  variant?: BtnVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}) {
  const s =
    variant === "outline"
      ? [styles.btnOutline, disabled && styles.btnDisabled]
      : variant === "ghost"
      ? [styles.btnGhost, disabled && styles.btnDisabled]
      : [styles.btnPrimary, disabled && styles.btnDisabled];

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[...s, style]}>
      <Text
        style={[
          variant === "outline" ? styles.btnOutlineText : styles.btnText,
          textStyle,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

/** ========== Badge / Pill ========== */
type Tone = "info" | "success" | "warn" | "error" | "neutral";
export function RtaBadge({ text, tone = "neutral", style }: { text: string; tone?: Tone; style?: ViewStyle }) {
  const toneStyle =
    tone === "success"
      ? { backgroundColor: RTA.color.success }
      : tone === "warn"
      ? { backgroundColor: RTA.color.warn }
      : tone === "error"
      ? { backgroundColor: RTA.color.error }
      : tone === "info"
      ? { backgroundColor: RTA.color.outline }
      : { backgroundColor: RTA.color.neutral };

  return (
    <View style={[styles.badge, toneStyle, style]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

/** ========== Styles ========== */
const styles = StyleSheet.create({
  // Card
  card: {
    backgroundColor: RTA.color.card,
    borderRadius: RTA.radius.lg,
    borderWidth: 1,
    borderColor: RTA.color.cardBorder,
    padding: 12,
    ...shadow(1),
  },

  // Buttons
  btnPrimary: {
    backgroundColor: RTA.color.primary,
    borderRadius: RTA.radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  btnOutline: {
    borderWidth: 2,
    borderColor: RTA.color.outline,
    borderRadius: RTA.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  btnOutlineText: { color: RTA.color.outline, fontWeight: "700", fontSize: 16 },

  btnGhost: {
    borderRadius: RTA.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },

  btnDisabled: { opacity: 0.5 },

  // Badge
  badge: {
    borderRadius: RTA.radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});




