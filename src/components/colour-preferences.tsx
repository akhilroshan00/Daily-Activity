"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import {
  COLOUR_OPTIONS,
  COLOUR_STORAGE_KEY,
  readColour,
  type ColourPreference,
} from "@/lib/ui-preferences";

export default function ColourPreferences({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [colour, setColour] = useState<ColourPreference>("violet");
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setColour(readColour(document.documentElement.dataset.colour));
    function sync(event: StorageEvent) {
      if (event.key !== COLOUR_STORAGE_KEY && event.key !== null) return;
      const next = readColour(event.newValue);
      document.documentElement.setAttribute("data-colour", next);
      setColour(next);
    }
    function closeOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !details.current?.contains(event.target)
      ) {
        if (details.current) details.current.open = false;
      }
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    }
    window.addEventListener("storage", sync);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      window.removeEventListener("storage", sync);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);
  function choose(next: ColourPreference) {
    document.documentElement.setAttribute("data-colour", next);
    setColour(next);
    try {
      localStorage.setItem(COLOUR_STORAGE_KEY, next);
    } catch {
      onNotice(
        "Colour changed for this session. Browser storage is unavailable.",
      );
    }
  }
  return (
    <details className="colour-preferences" ref={details}>
      <summary aria-label="Choose UI colour" title="Choose UI colour">
        <Palette size={18} aria-hidden="true" />
        <span>Colour</span>
      </summary>
      <div className="colour-popover">
        <strong>Make Daylight yours</strong>
        <p>Choose a colour for both light and dark mode.</p>
        <div
          className="colour-options"
          role="group"
          aria-label="UI colour presets"
        >
          {COLOUR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={colour === option.id}
              onClick={() => choose(option.id)}
            >
              <span
                className="colour-swatch"
                style={{ background: option.swatch }}
              >
                {colour === option.id && <Check size={16} aria-hidden="true" />}
              </span>
              {option.label}
            </button>
          ))}
        </div>
        <p className="colour-current" role="status">
          Selected:{" "}
          {COLOUR_OPTIONS.find((option) => option.id === colour)?.label}
          {colour === "violet" ? " (default)" : ""}
        </p>
        <button
          className="text-button"
          type="button"
          onClick={() => choose("violet")}
        >
          Reset to default
        </button>
      </div>
    </details>
  );
}
