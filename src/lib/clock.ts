const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
  }).format(new Date(value));
}
