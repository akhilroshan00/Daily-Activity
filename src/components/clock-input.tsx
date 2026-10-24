"use client";
import { clockParts, clockValue } from "@/lib/clock";

export default function ClockInput({
  value,
  onChange,
  label,
  id,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  required?: boolean;
}) {
  const { hour, minute, period } = clockParts(value);
  return (
    <span
      className="clock-input"
      role="group"
      aria-label={`${label} (12-hour time)`}
    >
      <select
        id={id}
        aria-label={`${label} hour`}
        required={required}
        value={hour}
        onChange={(e) => onChange(clockValue(e.target.value, minute, period))}
      >
        <option value="">HH</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} minute`}
        value={minute}
        onChange={(e) =>
          onChange(
            e.target.value
              ? clockValue(hour || "12", e.target.value, period)
              : "",
          )
        }
      >
        <option value="">MM</option>
        {Array.from({ length: 60 }, (_, i) => {
          const m = String(i).padStart(2, "0");
          return (
            <option key={m} value={m}>
              {m}
            </option>
          );
        })}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        value={period}
        onChange={(e) =>
          onChange(clockValue(hour || "12", minute, e.target.value))
        }
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  );
}
