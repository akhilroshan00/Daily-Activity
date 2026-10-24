const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export type ClockPeriod = "AM" | "PM";

// Accept a familiar clock face or quick numeric entry, with an optional period.
// Invalid/incomplete text returns undefined instead of retaining an older time.
export function parseClockInput(text: string, period: ClockPeriod = "AM") {
  const value = text.trim();
  if (!value) return "";
  const match = /^(\d{1,4})(?:[:.]([0-5]\d))?\s*(am|pm)?$/i.exec(value);
  if (!match) return undefined;
  let hour = match[1],
    minute = match[2] ?? "00";
  if (hour.length > 2) {
    if (match[2]) return undefined;
    minute = hour.slice(-2);
    hour = hour.slice(0, -2);
  }
  if (Number(hour) < 1 || Number(hour) > 12 || Number(minute) > 59)
    return undefined;
  return clockValue(hour, minute, match[3]?.toUpperCase() ?? period);
}

export function clockFace(value: string) {
  const { hour, minute } = clockParts(value);
  return hour ? `${hour}:${minute}` : "";
}

export function clockParts(value: string) {
  if (!CLOCK.test(value)) return { hour: "", minute: "", period: "AM" };
  const hour = Number(value.slice(0, 2));
  return {
    hour: String(hour % 12 || 12),
    minute: value.slice(3),
    period: hour >= 12 ? "PM" : "AM",
  };
}

export function clockValue(hour: string, minute: string, period: string) {
  if (!hour) return "";
  const h = Number(hour),
    m = Number(minute || "0");
  if (
    !Number.isInteger(h) ||
    h < 1 ||
    h > 12 ||
    !Number.isInteger(m) ||
    m < 0 ||
    m > 59 ||
    !["AM", "PM"].includes(period)
  )
    throw new Error("Choose a valid time with AM or PM.");
  return `${String((h % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatClock(value: string) {
  if (!CLOCK.test(value)) return "";
  const { hour, minute, period } = clockParts(value);
  return `${hour}:${minute} ${period}`;
}

export function formatTimestamp(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
    .format(new Date(value))
    .replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
}
