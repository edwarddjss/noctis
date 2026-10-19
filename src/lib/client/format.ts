import type { Match } from "../domain";

export function kickoffLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay) return time;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function statusText(m: Match): string {
  switch (m.status) {
    case "live":
      return m.statusLabel || (m.minute != null ? `${m.minute}'` : "Live");
    case "halftime":
      return "HT";
    case "finished":
      return m.statusLabel || "FT";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
    case "scheduled":
      return kickoffLabel(m.kickoff);
    default:
      return m.statusLabel || "—";
  }
}
