"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Entries } from "@/lib/activity";
import { cloudClient } from "@/lib/cloud";
import { workspaceKeys } from "@/lib/workspace-storage";
import {
  emptyReport,
  hasReportEntry,
  nextReportCheck,
  readReportStore,
  reportClock,
  reportReminderDue,
  reportSource,
  REPORT_TEXT_LIMIT,
  type ReportStore,
} from "@/lib/daily-report";

export function useDailyReports(userId: string, entries: Entries) {
  const key = `${workspaceKeys(userId).activity}:daily-reports.v1`;
  const [store, setStore] = useState<ReportStore | null>(null);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [today, setToday] = useState(() => reportClock(new Date()).date);
  const [reminderDate, setReminderDate] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  const requestRef = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());
  const presentedReminder = useRef<string | null>(null);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    const load = () => {
      try {
        const saved = readReportStore(localStorage.getItem(key));
        setStore(saved);
        setStorageError("");
        setReminderDate((date) =>
          date && !reportReminderDue(new Date(), saved.reports[date])
            ? null
            : date,
        );
      } catch {
        setStore(null);
        setStorageError(
          "Daily reports could not be loaded. Existing report data is preserved; check browser storage.",
        );
      }
    };
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) load();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      requestRef.current?.abort();
    };
  }, [key]);

  // Always merge against the latest account store, including changes in other tabs.
  const change = useCallback(
    (transform: (latest: ReportStore) => ReportStore) => {
      try {
        const next = transform(readReportStore(localStorage.getItem(key)));
        localStorage.setItem(key, JSON.stringify(next));
        setStore(next);
        setStorageError("");
        return true;
      } catch {
        setStorageError(
          "Could not save the report or confirmation. Check browser storage and try again.",
        );
        return false;
      }
    },
    [key],
  );

  const generate = useCallback(
    async (date: string, force = false) => {
      if (requestRef.current) return;
      const run = async () => {
        if (requestRef.current) return;
        let saved: ReportStore;
        try {
          saved = readReportStore(localStorage.getItem(key));
        } catch {
          setStorageError(
            "Reports could not be read. Existing report data is preserved.",
          );
          return;
        }
        const entry = entriesRef.current[date];
        if (!hasReportEntry(entry)) {
          if (force) setError("Save an entry for this date first.");
          return;
        }
        const source = reportSource(date, entry, saved.template);
        const previous = saved.reports[date];
        const attempt = `${date}:${source}`;
        if (
          !force &&
          (previous?.sentAt ||
            previous?.source === source ||
            attempted.current.has(attempt))
        )
          return;
        attempted.current.add(attempt);
        const controller = new AbortController();
        requestRef.current = controller;
        setBusy(date);
        setError("");
        try {
          const client = cloudClient();
          const session = await client?.auth.getSession();
          if (controller.signal.aborted) return;
          if (session?.data.session?.user.id !== userId)
            throw new Error("Sign in again to generate a report.");
          const response = await fetch("/api/daily-report", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.data.session.access_token}`,
            },
            body: JSON.stringify({ date, entry, template: saved.template }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(70000),
            ]),
          });
          const result = await response.json();
          const latestSession = await client?.auth.getSession();
          if (
            controller.signal.aborted ||
            latestSession?.data.session?.user.id !== userId
          )
            return;
          if (!response.ok)
            throw new Error(
              result.error || "Could not generate the report. Try again.",
            );
          if (
            result.owner !== userId ||
            result.date !== date ||
            typeof result.text !== "string" ||
            !result.text.trim() ||
            result.text.length > REPORT_TEXT_LIMIT
          )
            throw new Error("Could not verify the generated report.");
          change((latest) => {
            // A response for an older entry/template must never replace a newer draft
            // or a confirmation recorded while the AI was still running.
            if (
              reportSource(date, entriesRef.current[date], latest.template) !==
                source ||
              latest.reports[date]?.sentAt !== previous?.sentAt
            )
              return latest;
            return {
              ...latest,
              reports: {
                ...latest.reports,
                [date]: {
                  ...latest.reports[date],
                  text: result.text.trim(),
                  source,
                  generatedAt: new Date().toISOString(),
                  sentAt: undefined,
                },
              },
            };
          });
        } catch (failure) {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not generate the report. Try again.",
            );
        } finally {
          if (!controller.signal.aborted) {
            requestRef.current = null;
            setBusy(null);
          }
        }
      };
      // One automatic request per day/source across tabs on browsers with Web Locks.
      if (navigator.locks) {
        await navigator.locks.request(
          `${key}:generate`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await run();
            else if (force)
              setError(
                "A report is being generated in another Daylight tab. Please wait.",
              );
          },
        );
      } else await run();
    },
    [key, userId, change],
  );

  useEffect(() => {
    if (!store || busy || !hasReportEntry(entries[today])) return;
    const timer = setTimeout(() => {
      void generate(today);
    }, 1800);
    return () => clearTimeout(timer);
  }, [store, entries, today, busy, generate]);

  useEffect(() => {
    if (!store) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const now = new Date();
      const date = reportClock(now).date;
      setToday(date);
      setReminderDate((current) =>
        current && current !== date ? null : current,
      );
      try {
        const latest = readReportStore(localStorage.getItem(key));
        const report = latest.reports[date];
        if (reportReminderDue(now, report)) {
          const occurrence = `${date}:${report?.snoozedUntil ?? "initial"}`;
          if (presentedReminder.current !== occurrence) {
            // Only an explicit user action acknowledges the popup. A reload or
            // a closed background tab must not silently dismiss an unseen alert.
            presentedReminder.current = occurrence;
            setReminderDate(date);
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                new Notification("Daily report not marked sent", {
                  body: "It's 5:00 PM IST. Review your daily report and confirm after sending it.",
                  tag: `daily-report:${userId}:${date}`,
                });
              } catch {
                /* The in-app dialog remains available. */
              }
            }
          }
        } else setReminderDate(null);
        timer = setTimeout(check, Math.max(100, nextReportCheck(now, report)));
      } catch {
        /* Report storage errors are surfaced by load/change. */
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, store, userId, change]);

  function markSent(date: string, sent = true) {
    if (!sent) presentedReminder.current = null;
    const ok = change((latest) => ({
      ...latest,
      reports: {
        ...latest.reports,
        [date]: {
          ...(latest.reports[date] ?? emptyReport()),
          sentAt: sent ? new Date().toISOString() : undefined,
          remindedAt: sent ? latest.reports[date]?.remindedAt : undefined,
          snoozedUntil: undefined,
        },
      },
    }));
    if (ok && reminderDate === date) setReminderDate(null);
    return ok;
  }
  function dismissReminder(snooze = false) {
    if (!reminderDate) return;
    const date = reminderDate;
    if (
      change((latest) => ({
        ...latest,
        reports: {
          ...latest.reports,
          [date]: {
            ...(latest.reports[date] ?? emptyReport()),
            remindedAt: new Date().toISOString(),
            snoozedUntil: snooze
              ? new Date(Date.now() + 600000).toISOString()
              : undefined,
          },
        },
      }))
    )
      setReminderDate(null);
  }
  return {
    store,
    today,
    busy,
    error,
    storageError,
    reminderDate,
    generate,
    markSent,
    dismissReminder,
    saveTemplate: (template: string) =>
      change((latest) => ({ ...latest, template })),
  };
}
