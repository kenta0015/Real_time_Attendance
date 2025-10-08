// styles/tokens.ts
import { Platform } from "react-native";
import type { TextStyle, ViewStyle } from "react-native";

/**
 * Color palette
 * （ブルー基調・ライト背景 / ダークテキストのモダンUI想定）
 */
export const color = {
  // Brand
  primary: "#2563EB",          // blue-600
  primary700: "#1D4ED8",       // blue-700
  primarySurface: "#EEF2FF",   // indigo-50 近似（淡い面）
  primaryBorder: "#C7D2FE",    // indigo-200 近似

  // Semantic
  danger: "#DC2626",           // red-600
  success: "#10B981",          // emerald-500
  warning: "#F59E0B",          // amber-500

  // Neutrals / UI
  bg: "#F7F8FA",
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  shadow: "rgba(2,6,23,0.06)", // 深すぎない影

  // Text
  text: "#0F172A",
  textMuted: "#6B7280",
  textSubtle: "#9CA3AF",

  // Chips / Pills
  chipBg: "#F1F5F9",
  chipBorder: "#E2E8F0",
} as const;

/** Spacing scale (px) */
export const spacing = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
} as const;

/** Corner radius (px) */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Typography tokens */
export const font = {
  size: {
    xs: 12,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
    h2: 20,
    h1: 22,
  },
  weight: {
    regular: "400" as TextStyle["fontWeight"],
    semibold: "600" as TextStyle["fontWeight"],
    bold: "700" as TextStyle["fontWeight"],
    extrabold: "800" as TextStyle["fontWeight"],
  },
  familyMono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  })!,
} as const;

/** 共通シャドウ（プラットフォーム差異を吸収） */
export const shadow = (level: 1 | 2 | 3 = 2): ViewStyle => {
  const height = level === 1 ? 2 : level === 2 ? 4 : 8;
  const radiusPx = level === 1 ? 6 : level === 2 ? 12 : 18;

  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.07,
      shadowRadius: radiusPx,
      shadowOffset: { width: 0, height },
    },
    android: { elevation: level * 2 },
    default: { boxShadow: `0 ${height}px ${radiusPx}px ${color.shadow}` as any },
  })!;
};

/** Card のベーススタイル */
export const cardBase: ViewStyle = {
  backgroundColor: color.cardBg,
  borderColor: color.border,
  borderWidth: 1,
  borderRadius: radius.lg,
  padding: spacing.md,
};

/** Primary ボタンのベース＆バリアント */
export const button = {
  base: {
    alignItems: "center" as ViewStyle["alignItems"],
    justifyContent: "center" as ViewStyle["justifyContent"],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  variants: {
    primary: {
      backgroundColor: color.primary,
    },
    danger: {
      backgroundColor: color.danger,
    },
    outline: {
      backgroundColor: "transparent",
      borderWidth: 2,
      borderColor: color.primary,
    },
  },
  text: {
    primary: { color: "#fff", fontWeight: font.weight.extrabold } as TextStyle,
    danger: { color: "#fff", fontWeight: font.weight.extrabold } as TextStyle,
    outline: { color: color.primary, fontWeight: font.weight.extrabold } as TextStyle,
  },
} as const;

/** Status pill（ACTIVE/UPCOMING/PAST 等）の共通スタイル */
export const pill = {
  base: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  } as ViewStyle,
  variants: {
    info: { backgroundColor: color.primarySurface, borderColor: color.primaryBorder } as ViewStyle,
    neutral: { backgroundColor: color.chipBg, borderColor: color.chipBorder } as ViewStyle,
  },
  text: {
    info: { color: color.primary, fontSize: 12, fontWeight: font.weight.extrabold } as TextStyle,
    neutral: { color: "#334155", fontSize: 12, fontWeight: font.weight.bold } as TextStyle,
  },
} as const;

/** タイル（Live の統計など） */
export const tileBase: ViewStyle = {
  backgroundColor: color.cardBg,
  borderColor: color.border,
  borderWidth: 1,
  borderRadius: radius.lg,
  padding: spacing.md,
  minWidth: 88,
};

/** よく使うテキストスタイル */
export const textStyles = {
  h1: { fontSize: font.size.h1, fontWeight: font.weight.extrabold, color: color.text } as TextStyle,
  h2: { fontSize: font.size.h2, fontWeight: font.weight.extrabold, color: color.text } as TextStyle,
  body: { fontSize: font.size.md, color: color.text } as TextStyle,
  muted: { fontSize: font.size.md, color: color.textMuted } as TextStyle,
  subtle: { fontSize: font.size.sm, color: color.textSubtle } as TextStyle,
} as const;

/** 画面のベース背景 */
export const screen = {
  container: {
    flex: 1,
    backgroundColor: color.bg,
    padding: spacing.lg,
  } as ViewStyle,
} as const;

/** まとめて渡したい人向け */
export const tokens = {
  color,
  spacing,
  radius,
  font,
  shadow,
  cardBase,
  button,
  pill,
  tileBase,
  textStyles,
  screen,
};
export type Tokens = typeof tokens;

// --- token.ts の末尾に追記 ---
export { color as COLORS, radius as RADIUS, spacing as SPACING, shadow as SHADOWS };
// 任意（あると便利）
export type { Tokens as TOKENS } from "./token";
