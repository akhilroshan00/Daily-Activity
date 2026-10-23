"use client";

import { useId, useState, useEffect } from "react";
import { cloudClient } from "@/lib/cloud";
import { searchSyllabus } from "@/lib/syllabus";

export default function SyllabusInput({
  id,
  value,
  onChange,
  maxLength = 160,
  required,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [ai, setAi] = useState<{ query: string; titles: string[] } | null>(
    null,
  );
  const [aiStatus, setAiStatus] = useState("");
  const local = searchSyllabus(value).filter(
    (lesson) => lesson.title.length <= maxLength,
  );
  const matches = local.length
    ? local
    : ai?.query === value
      ? ai.titles.map((title) => ({ title }))
      : [];
  const visible = open && matches.length > 0;
  useEffect(() => {
    if (
      !open ||
      local.length ||
      value.trim().length < 3 ||
      /^(?:day\s*)?\d+$/i.test(value.trim())
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAiStatus("Finding subjects with AI...");
      try {
        const client = cloudClient();
        const session = (await client?.auth.getSession())?.data.session;
        if (controller.signal.aborted) return;
        if (!session) throw new Error("Sign in to use AI suggestions.");
        const response = await fetch("/api/syllabus", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ query: value }),
          signal: controller.signal,
        });
        const data = await response.json();
        const latest = (await client?.auth.getSession())?.data.session;
        if (controller.signal.aborted || latest?.user.id !== session.user.id)
          return;
        if (
          !response.ok ||
          data.owner !== session.user.id ||
          !Array.isArray(data.subjects)
        )
          throw new Error("AI unavailable. Keep typing your subject.");
        const titles = data.subjects.filter(
          (title: unknown): title is string =>
            typeof title === "string" && title.length <= maxLength,
        );
        setAi({ query: value, titles });
        setActive(-1);
        setAiStatus(
          titles.length
            ? ""
            : "No matching subjects. You can use your own title.",
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setAiStatus(
            error instanceof Error ? error.message : "AI unavailable.",
          );
      }
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open, local.length, maxLength]);
  function select(title: string) {
    onChange(title);
    setOpen(false);
    setActive(-1);
  }
  return (
    <span className="syllabus-input">
      <input
        id={id}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={
          visible && active >= 0 && matches[active]
            ? `${listId}-${active}`
            : undefined
        }
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setAiStatus("");
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          } else if (
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            matches.length
          ) {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              event.key === "ArrowDown"
                ? (current + 1) % matches.length
                : current <= 0
                  ? matches.length - 1
                  : current - 1,
            );
          } else if (
            event.key === "Enter" &&
            visible &&
            active >= 0 &&
            matches[active]
          ) {
            event.preventDefault();
            select(matches[active].title);
          }
        }}
      />
      {open && !local.length && value.trim().length >= 3 && (
        <small className="field-help" role="status">
          {aiStatus || "AI can match your subject. Typed text is sent to Groq."}
        </small>
      )}
      {visible && (
        <span
          id={listId}
          role="listbox"
          aria-label="Syllabus suggestions"
          className="syllabus-suggestions"
        >
          {matches.map((lesson, index) => (
            <span
              key={lesson.title}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              className="syllabus-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(lesson.title)}
            >
              <strong>{lesson.title}</strong>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
