"use client";

import { useId, useState } from "react";
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
  const matches = searchSyllabus(value).filter(
    (lesson) => lesson.title.length <= maxLength,
  );
  const visible = open && matches.length > 0;
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
      {visible && (
        <span
          id={listId}
          role="listbox"
          aria-label="Syllabus suggestions"
          className="syllabus-suggestions"
        >
          {matches.map((lesson, index) => (
            <span
              key={lesson.day}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              className="syllabus-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(lesson.title)}
            >
              <strong>
                Day {lesson.day} · {lesson.title}
              </strong>
              <small>
                {lesson.pattern} · {lesson.lab}
              </small>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
