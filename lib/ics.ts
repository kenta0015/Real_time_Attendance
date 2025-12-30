/// <reference lib="dom" />


// Tiny .ics builder (UTC) with optional VALARM and URL
function pad2(n: number) { return n.toString().padStart(2, "0"); }

function toUTCStamp(d: Date) {
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) + "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) + "Z"
  );
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export type ICSInput = {
  id: string;
  title: string;
  startUtc: string;     // ISO (UTC)
  endUtc: string;       // ISO (UTC)
  tzid?: string;        // not used (UTC calendar)
  venueLat?: number;
  venueLng?: number;
  url?: string;         // deep link (rta://… / exp://… / http://…)
  alarmMinutes?: number; // e.g., 30
};

export function buildICS(input: ICSInput) {
  const dtstamp = toUTCStamp(new Date());
  const dtstart = toUTCStamp(new Date(input.startUtc));
  const dtend   = toUTCStamp(new Date(input.endUtc));
  const uid = `${input.id}@rta`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RTA//Attendance//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];

  if (typeof input.venueLat === "number" && typeof input.venueLng === "number") {
    lines.push(`GEO:${input.venueLat};${input.venueLng}`);
    lines.push(`LOCATION:Lat ${input.venueLat}, Lng ${input.venueLng}`);
  }

  if (input.url) {
    lines.push(`URL:${escapeText(input.url)}`);
    // 予備として説明にもURLを入れておく（クライアントによってはクリック可）
    lines.push(`DESCRIPTION:${escapeText(input.title)}\\nJoin: ${escapeText(input.url)}`);
  }

  // VALARM（カレンダー側リマインド）
  const mins = input.alarmMinutes ?? 0;
  if (mins > 0) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${mins}M`,
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n"); // ICS requires CRLF
}

// Web-only download helper
export function downloadICSWeb(filename: string, icsText: string) {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}




