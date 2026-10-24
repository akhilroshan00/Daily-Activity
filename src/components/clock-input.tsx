"use client";
import { useEffect, useRef, useState } from "react";
import {
  clockFace,
  clockParts,
  parseClockInput,
  type ClockPeriod,
} from "@/lib/clock";

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
  const [text, setText] = useState(() => clockFace(value));
  const [period, setPeriod] = useState<ClockPeriod>(
    () => clockParts(value).period as ClockPeriod,
  );
  const field = useRef<HTMLInputElement>(null);
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(clockFace(value));
    setPeriod(clockParts(value).period as ClockPeriod);
    field.current?.setCustomValidity("");
  }, [value]);

  function update(nextText: string, nextPeriod: ClockPeriod) {
    const parsed = parseClockInput(nextText, nextPeriod);
    setText(nextText);
    setPeriod(parsed ? (clockParts(parsed).period as ClockPeriod) : nextPeriod);
    field.current?.setCustomValidity(
      parsed === undefined
        ? "Enter a time like 9:30 or 930, from 1:00 to 12:59."
        : "",
    );
    emitted.current = parsed ?? "";
    onChange(emitted.current);
  }
  return (
    <span
      className="clock-input"
      role="group"
      aria-label={`${label} (12-hour time)`}
    >
      <input
        ref={field}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        required={required}
        maxLength={10}
        placeholder="9:30"
        title="Enter a time such as 9:30 or 930, then choose AM or PM."
        value={text}
        onChange={(e) => update(e.target.value, period)}
        onBlur={() => {
          const parsed = parseClockInput(text, period);
          if (parsed !== undefined) setText(clockFace(parsed));
        }}
      />
      <span
        className="clock-period"
        role="group"
        aria-label={`${label} AM or PM`}
      >
        {(["AM", "PM"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`${label} ${option}`}
            aria-pressed={period === option}
            onClick={() => update(text.replace(/\s*(am|pm)$/i, ""), option)}
          >
            {option}
          </button>
        ))}
      </span>
    </span>
  );
}
