import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Text,
  Platform,
} from "react-native";
import { COLORS, RADIUS, SPACING, SHADOWS } from "@ui/theme";

type RadiusKey = keyof typeof RADIUS;
type PaddingSize = "none" | "sm" | "md" | "lg";
type Variant = "elevated" | "outlined" | "soft";

export type CardProps = {
  children?: React.ReactNode;
  /** 影あり = elevated / 枠線のみ = outlined / 薄色面 = soft */
  variant?: Variant;
  /** 角丸（デフォルト: xl） */
  radius?: RadiusKey;
  /** パディング（デフォルト: md） */
  padding?: PaddingSize;
  /** クリック可能なら onPress を渡す（Touchableに切替） */
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;

  /** よくある見出し用途（任意） */
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Card({
  children,
  variant = "elevated",
  radius = "xl",
  padding = "md",
  onPress,
  disabled,
  style,
  testID,
  title,
  subtitle,
  right,
  footer,
}: CardProps) {
  const Container = onPress ? TouchableOpacity : View;

  const base: ViewStyle = {
    borderRadius: RADIUS[radius],
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardBg,
    ...(variant === "elevated" ? (SHADOWS.card as object) : null),
  };

  if (variant === "outlined") {
    // 枠のみ、影なし・白背景のまま
  } else if (variant === "soft") {
    base.backgroundColor = "#F8FAFF"; // ごく薄いブルー系
    base.borderColor = "#E6ECFF";
  }

  const paddingStyle: ViewStyle =
    padding === "none"
      ? { padding: 0 }
      : padding === "sm"
      ? { padding: SPACING.sm }
      : padding === "lg"
      ? { padding: SPACING.lg }
      : { padding: SPACING.md };

  return (
    <Container
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      disabled={disabled}
      style={[base, paddingStyle, disabled && styles.disabled, style]}
      testID={testID}
      accessibilityRole={onPress ? "button" : "summary"}
      accessibilityState={{ disabled: !!disabled }}
    >
      {(title || subtitle || right) ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      ) : null}

      {children}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  right: {
    marginLeft: SPACING.md,
    alignSelf: "flex-start",
  },
  footer: {
    marginTop: SPACING.md,
  },
  disabled: {
    opacity: Platform.OS === "web" ? 0.7 : 0.6,
  },
});




