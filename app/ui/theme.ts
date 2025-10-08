// app/ui/theme.ts
import { color, spacing, radius, shadow } from "../stlyes/token";

/**
 * 旧コードが参照している名前に合わせたブリッジ。
 * - COLORS は token の color をそのまま展開しつつ、過去互換の別名も足す
 * - SHADOWS はオブジェクト形式(card/floating)で返す
 * - RADIUS/SPACING はそのまま re-export
 */

export const COLORS = {
  ...color,

  // --- 互換キー（既存コードが参照しているもの） ---
  // ボタン実装・一部UIが期待
  primary600: color.primary,
  primaryTextOn: "#FFFFFF",

  // 旧 theme 由来
  cardBorder: color.border,
  outline: color.primary,

  // 旧 theme の “グレー系” 想定を最低限カバー（fallback）
  white: "#FFFFFF",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray500: "#6B7280",
} as const;

export const SPACING = spacing;
export const RADIUS = radius;

// 旧 SHADOWS.card 参照に対応
export const SHADOWS = {
  card: shadow(2),
  floating: shadow(3),
} as const;

// 旧 Button のカラーユーティリティ（そのまま互換維持）
export type ButtonVariant = "primary" | "outline" | "danger" | "ghost";
type ButtonColorSet = { backgroundColor: string; borderColor: string; textColor: string };

export function buttonColors(variant: ButtonVariant, disabled?: boolean): ButtonColorSet {
  const white = COLORS.white;
  const primary600 = COLORS.primary600;
  const primary700 = color.primary700 ?? COLORS.primary600;
  const danger600 = color.danger;
  const gray200 = COLORS.gray200;
  const gray300 = COLORS.gray300;
  const gray500 = COLORS.gray500;

  if (disabled) {
    if (variant === "outline" || variant === "ghost") {
      return { backgroundColor: "transparent", borderColor: gray300, textColor: gray500 };
    }
    return { backgroundColor: gray200, borderColor: gray200, textColor: gray500 };
  }

  switch (variant) {
    case "danger":
      return { backgroundColor: danger600, borderColor: danger600, textColor: white };
    case "outline":
      return { backgroundColor: "transparent", borderColor: primary600, textColor: primary700 };
    case "ghost":
      return { backgroundColor: "transparent", borderColor: "transparent", textColor: primary600 };
    default:
      return { backgroundColor: primary600, borderColor: primary600, textColor: white };
  }
}
