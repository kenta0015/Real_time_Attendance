// app/ui/Pill.tsx
import React from "react";
import { Text, View, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { COLORS, RADIUS } from "@ui/theme";

type Variant = "brand" | "success" | "warning" | "danger" | "info" | "neutral";
type Tone = "filled" | "soft" | "outline";

export type PillProps = {
  /** 新: 推奨 */
  label?: string;
  /** 互換: 旧コード向け（label が無ければこちらを使う） */
  text?: string;
  variant?: Variant;
  tone?: Tone;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function Pill({
  label,
  text,
  variant = "brand",
  tone = "filled",
  style,
  textStyle,
}: PillProps) {
  const content = (label ?? text ?? "").toString();

  const { bg, bd, tx } = palette(variant, tone);
  return (
    <View style={[styles.base, { backgroundColor: bg, borderColor: bd }, style]}>
      <Text style={[styles.txt, { color: tx }, textStyle]}>{content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  txt: { fontSize: 12, fontWeight: "800" },
});

// 色決定
function palette(variant: Variant, tone: Tone) {
  // ベースカラー
  const brand = { main: COLORS.primary, softBg: COLORS.primarySurface, softBd: COLORS.primaryBorder, softTx: COLORS.primary };
  const success = { main: COLORS.success, softBg: "#ECFDF5", softBd: "#A7F3D0", softTx: "#065F46" };
  const warning = { main: COLORS.warning, softBg: "#FFFBEB", softBd: "#FDE68A", softTx: "#92400E" };
  const danger = { main: COLORS.danger, softBg: "#FEF2F2", softBd: "#FECACA", softTx: "#991B1B" };
  const info = { main: COLORS.outline, softBg: "#EFF6FF", softBd: "#BFDBFE", softTx: "#1D4ED8" };
  const neutral = { main: "#64748B", softBg: "#F1F5F9", softBd: "#E2E8F0", softTx: "#334155" };

  const m = variant === "success" ? success :
            variant === "warning" ? warning :
            variant === "danger"  ? danger  :
            variant === "info"    ? info    :
            variant === "neutral" ? neutral : brand;

  if (tone === "filled") {
    return { bg: m.main, bd: m.main, tx: "#FFFFFF" };
  }
  if (tone === "outline") {
    return { bg: "transparent", bd: m.main, tx: m.main };
  }
  // soft
  return { bg: m.softBg, bd: m.softBd, tx: m.softTx };
}




