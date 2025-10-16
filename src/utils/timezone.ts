// app/utils/timezone.ts
// Render event times in the venue's time zone (default: Australia/Melbourne).
// Pure Intl API (no extra deps).

export const VENUE_TZ = "Australia/Melbourne";

/** Format a single UTC ISO string in the venue time zone. */
export function formatInVenueTZ(
  isoUtc: string | Date,
  opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }
): string {
  const d = typeof isoUtc === "string" ? new Date(isoUtc) : isoUtc;
  return new Intl.DateTimeFormat(undefined, { timeZone: VENUE_TZ, ...opts }).format(d);
}

/** Format a start→end range in the venue time zone (condenses date when same day). */
export function formatRangeInVenueTZ(
  startUtc: string | Date,
  endUtc: string | Date,
  locale?: string
): string {
  const l = locale ?? undefined;
  const timeFmt: Intl.DateTimeFormatOptions = {
    timeZone: VENUE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  const dStart = typeof startUtc === "string" ? new Date(startUtc) : startUtc;
  const dEnd = typeof endUtc === "string" ? new Date(endUtc) : endUtc;

  const ymdFmt: Intl.DateTimeFormatOptions = {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
  };

  const ymdStart = new Intl.DateTimeFormat(l, ymdFmt).format(dStart);
  const ymdEnd = new Intl.DateTimeFormat(l, ymdFmt).format(dEnd);
  const sameDay = ymdStart === ymdEnd;

  const startPart = new Intl.DateTimeFormat(l, timeFmt).format(dStart);
  const endPart = new Intl.DateTimeFormat(l, timeFmt).format(dEnd);

  if (sameDay) {
    return `${ymdStart} ${startPart}–${endPart} (${tzShort(dStart)})`;
  }
  return `${ymdStart} ${startPart} → ${ymdEnd} ${endPart} (${tzShort(dStart)})`;
}

/** Show user's local time as a hint when different from venue TZ. */
export function maybeLocalHint(isoUtc: string | Date): string | null {
  const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (userTZ === VENUE_TZ) return null;
  const d = typeof isoUtc === "string" ? new Date(isoUtc) : isoUtc;
  const local = new Intl.DateTimeFormat(undefined, {
    timeZone: userTZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `Your local: ${local} (${userTZ})`;
}

/** Returns a short offset like UTC+11/UTC+10 for the venue TZ at given date. */
export function tzShort(date: Date = new Date()): string {
  const withName = new Intl.DateTimeFormat("en-AU", {
    timeZone: VENUE_TZ,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const m = withName.match(/([GU]MT[+-]\d{1,2})/i) || withName.match(/UTC[+-]\d{1,2}/i);
  return m ? m[0].toUpperCase().replace("GMT", "UTC") : "UTC";
}
