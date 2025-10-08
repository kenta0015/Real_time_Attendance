import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { COLORS, RADIUS, SPACING, SHADOWS } from "./theme";

type Variant = "neutral" | "brand" | "success" | "warning" | "danger";
type Size = "md" | "lg";

export type TileProps = {
  label: string;
  value: string | number | React.ReactNode;
  meta?: string;                 // 例: "vs last week +12%"
  iconLeft?: React.ReactNode;    // アイコン任意
  onPress?: () => void;
  loading?: boolean;
  size?: Size;
  variant?: Variant;             // 上部アクセント色に反映
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  metaStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export default function Tile({
  label,
  value,
  meta,
  iconLeft,
  onPress,
  loading,
  size = "md",
  variant = "neutral",
  style,
  labelStyle,
  valueStyle,
  metaStyle,
  testID,
}: TileProps) {
  const Container = onPress ? TouchableOpacity : View;
  const { pad, radius, valueFont } = sizing(size);
  const accent = accentColor(variant);

  return (
    <Container
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : "summary"}
      testID={testID}
      style={[
        styles.card,
        {
          padding: pad,
          borderRadius: radius,
          borderColor: COLORS.cardBorder,
          backgroundColor: COLORS.cardBg,
        },
        SHADOWS.card as object,
        style,
      ]}
    >
      {/* accent bar */}
      <View
        style={[
          styles.accent,
          { backgroundColor: accent, borderTopLeftRadius: radius, borderTopRightRadius: radius },
        ]}
      />

      <View style={styles.row}>
        {iconLeft ? <View style={styles.icon}>{iconLeft}</View> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: COLORS.textMuted }, labelStyle]} numberOfLines={1}>
            {label}
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            {loading ? (
              <ActivityIndicator />
            ) : typeof value === "string" || typeof value === "number" ? (
              <Text
                style={[
                  styles.value,
                  { fontSize: valueFont, color: COLORS.text },
                  valueStyle,
                ]}
                numberOfLines={1}
              >
                {value}
              </Text>
            ) : (
              value
            )}
          </View>

          {meta ? (
            <Text style={[styles.meta, { color: COLORS.textMuted }, metaStyle]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
    </Container>
  );
}

function sizing(size: Size) {
  if (size === "lg") {
    return { pad: SPACING.lg, radius: RADIUS.xl, valueFont: 22 };
  }
  return { pad: SPACING.md, radius: RADIUS.lg, valueFont: 18 };
}

function accentColor(variant: Variant) {
  switch (variant) {
    case "brand":
      return COLORS.primary;
    case "success":
      return COLORS.success;
    case "warning":
      return COLORS.warning;
    case "danger":
      return COLORS.danger;
    default:
      return "#E5E7EB"; // neutral
  }
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    position: "relative",
  },
  accent: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  value: {
    fontWeight: "800",
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
});
