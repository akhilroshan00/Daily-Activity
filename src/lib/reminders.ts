import { validDateKey } from "./activity";
export type Reminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: "once" | "daily" | "monthly";
  enabled: boolean;
  seen?: string;
};
export function validReminder(value: unknown): value is Reminder {
  if (!value || typeof value !== "object") return false;
  const r = value as Reminder;
  return (
    typeof r.id === "string" &&
    r.id.length <= 100 &&
    typeof r.title === "string" &&
    r.title.trim().length > 0 &&
    r.title.length <= 160 &&
    validDateKey(r.date) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.time) &&
    ["once", "daily", "monthly"].includes(r.repeat) &&
    typeof r.enabled === "boolean" &&
    (r.seen === undefined ||
      (typeof r.seen === "string" && r.seen.length <= 30))
  );
}
// Use local calendar time. Monthly schedules clamp the 29th–31st to month end.
export function reminderOccurrence(r: Reminder, now: Date): string | null {
  const [y, m, d] = r.date.split("-").map(Number);
  const [h, min] = r.time.split(":").map(Number);
  const start = new Date(y, m - 1, d, h, min);
  if (!r.enabled || now < start) return null;
  let due = start;
  if (r.repeat === "daily") {
    due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
    if (due > now) due.setDate(due.getDate() - 1);
  } else if (r.repeat === "monthly") {
    const candidate = (year: number, month: number) =>
      new Date(
        year,
        month,
        Math.min(d, new Date(year, month + 1, 0).getDate()),
        h,
        min,
      );
    due = candidate(now.getFullYear(), now.getMonth());
    if (due > now) due = candidate(now.getFullYear(), now.getMonth() - 1);
  }
  if (due < start) return null;
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T${r.time}`;
}
