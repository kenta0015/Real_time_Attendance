import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { buttonColors, ButtonVariant, RADIUS, SPACING, SHADOWS } from "@ui/theme";

type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: ButtonVariant;   // "primary" | "outline" | "danger"
  size?: ButtonSize;         // "sm" | "md" | "lg"
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

/**
 * 共通ボタン
 * - カラー/角丸/余白は theme.ts のトークンに準拠
 * - variant/size/disabled/loading をサポート
 * - アイコン左右（任意）
 */
export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  testID,
}: ButtonProps) {
  const isDisabled = !!disabled || !!loading;
  const colors = buttonColors(variant, isDisabled);

  const sizing = getSize(size);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      activeOpacity={0.8}
      onPress={(e) => {
        if (isDisabled) return;
        onPress?.(e);
      }}
      disabled={isDisabled}
      testID={testID}
      style={[
        styles.base,
        variant === "outline" ? styles.outline : styles.filled,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          paddingVertical: sizing.vert,
          paddingHorizontal: sizing.horz,
          borderRadius: RADIUS.lg,
          alignSelf: fullWidth ? "stretch" : "auto",
        },
        variant !== "outline" && SHADOWS.card,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {leftIcon ? <View style={[styles.icon, { marginRight: SPACING.sm }]}>{leftIcon}</View> : null}

      {loading ? (
        <ActivityIndicator size="small" color={colors.textColor} />
      ) : (
        <Text
          style={[
            styles.text,
            {
              color: colors.textColor,
              fontSize: sizing.font,
            },
            textStyle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      )}

      {rightIcon ? <View style={[styles.icon, { marginLeft: SPACING.sm }]}>{rightIcon}</View> : null}
    </TouchableOpacity>
  );
}

function getSize(size: ButtonSize) {
  switch (size) {
    case "sm":
      return { vert: SPACING.sm + 2, horz: SPACING.md, font: 14 };
    case "lg":
      return { vert: SPACING.lg, horz: SPACING.xl, font: 18 };
    default:
      return { vert: SPACING.md + 2, horz: SPACING.lg, font: 16 };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  filled: {},
  outline: {
    backgroundColor: "transparent",
  },
  text: {
    fontWeight: "700",
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.85,
  },
});




