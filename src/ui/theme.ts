// app/ui/theme.ts
import { color, spacing, radius, shadow } from "../../src/styles/token";

/**
 * Bridge for legacy theme consumers.
 * - COLORS spreads token `color` and adds legacy aliases.
 * - SHADOWS returns an object (card/floating).
 * - RADIUS/SPACING are re-exported.
 */

export const COLORS = {
  ...color,

  // --- Legacy aliases used by existing UI ---
  primary600: color.primary,
  primaryTextOn: "#FFFFFF",

  // Info tokens for Step 5 (accessibility & consistency)
  // Background existed as a fixed value in some components; text is added for proper contrast.
  infoBg: "#E8EDFF",
  infoText: "#1E3A8A", // dark blue (≈ blue-900), meets ~4.5:1 on #E8EDFF for small text

  // Old theme origins
  cardBorder: color.border,
  outline: color.primary,

  // Minimal gray/white fallbacks expected by old styles
  white: "#FFFFFF",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray500: "#6B7280",
} as const;

export const SPACING = spacing;
export const RADIUS = radius;

// Backward compatibility for SHADOWS.card access
export const SHADOWS = {
  card: shadow(2),
  floating: shadow(3),
} as const;

// ---- Button color helper (legacy compatible) ----
export type ButtonVariant = "primary" | "outline" | "danger" | "ghost";
type ButtonColorSet = { backgroundColor: string; borderColor: string; textColor: string };

export function buttonColors(variant: ButtonVariant, disabled?: boolean): ButtonColorSet {
  const white = COLORS.white;
  const primary600 = COLORS.primary600;
  const primary700 = (color as any).primary700 ?? COLORS.primary600;
  const danger600 = (color as any).danger ?? "#DC2626";
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
