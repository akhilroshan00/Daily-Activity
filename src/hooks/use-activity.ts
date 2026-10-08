"use client";
import { useEffect, useRef, useState } from "react";
import {
  decodeEntries,
  encodeEntries,
  STORAGE_KEY,
  type DayEntry,
  type Entries,
} from "@/lib/activity";

export function useActivity() {
  const [entries, setEntries] = useState<Entries>({});
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const current = useRef<Entries>({});
  const sessionOnly = useRef(false);
  useEffect(() => {
    function refresh() {
      if (sessionOnly.current) return;
      try {
        const next = decodeEntries(localStorage.getItem(STORAGE_KEY));
        current.current = next;
        setEntries(next);
        setStorageWarning("");
      } catch {
        setStorageWarning(
          "Saved data could not be read. It has been left intact. Download a backup before changing browser storage.",
        );
      }
      setReady(true);
    }
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function updateEntries(transform: (latest: Entries) => Entries): {
    ok: boolean;
    message: string;
  } {
    if (!ready)
      return { ok: false, message: "Your saved activities are still loading." };
    let latest = current.current;
    if (!sessionOnly.current) {
      let raw: string | null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        raw = null;
        sessionOnly.current = true;
      }
      if (!sessionOnly.current) {
        try {
          latest = decodeEntries(raw);
        } catch {
          return {
            ok: false,
            message:
              "Existing data is invalid. Back it up before resetting browser storage.",
          };
        }
      }
    }
    let next: Entries;
    try {
      next = decodeEntries(encodeEntries(transform(latest)));
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to save these changes.",
      };
    }
    try {
      if (sessionOnly.current) throw new Error("Storage unavailable");
      localStorage.setItem(STORAGE_KEY, encodeEntries(next));
      setStorageWarning("");
    } catch {
      sessionOnly.current = true;
      setStorageWarning(
        "Browser storage is unavailable or full. Changes are saved for this session only; download a backup before closing.",
      );
    }
    current.current = next;
    setEntries(next);
    return {
      ok: true,
      message: sessionOnly.current
        ? "Saved for this session. Download a backup to keep your data."
        : "Your day is saved.",
    };
  }
  function saveDay(
    key: string,
    entry: DayEntry,
    expected?: string,
  ): { ok: boolean; message: string } {
    return updateEntries((latest) => {
      if (
        expected !== undefined &&
        JSON.stringify(latest[key] ?? null) !== expected
      )
        throw new Error(
          "This day changed in another tab or during a focus session. Close and reopen it to load the latest version before saving.",
        );
      return {
        ...latest,
        [key]: { ...entry, updatedAt: new Date().toISOString() },
      };
    });
  }
  return { entries, ready, storageWarning, saveDay, updateEntries };
}
