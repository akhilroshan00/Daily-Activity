"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Entries } from "@/lib/activity";
import { cloudClient } from "@/lib/cloud";
import { workspaceKeys } from "@/lib/workspace-storage";
import {
  emptyReport,
  editReportText,
  canReplaceReport,
  ReportConflictError,
  hasReportEntry,
  nextReportCheck,
  readReportStore,
  reportClock,
  reportReminderDue,
  reportSource,
  REPORT_TEXT_LIMIT,
  type ReportStore,
  type ReportStyle,
} from "@/lib/daily-report";

export function useDailyReports(
  userId: string,
  entries: Entries,
  editingDate?: string,
) {
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
        setError("");
        return true;
      } catch (failure) {
        if (failure instanceof ReportConflictError) {
          setError(failure.message);
          return false;
        }
        setStorageError(
          "Could not save the report or confirmation. Check browser storage and try again.",
        );
        return false;
      }
    },
    [key],
  );

  const generate = useCallback(
    async (
      date: string,
      force = false,
      options?: { style: ReportStyle; instructions: string; draft: string },
    ) => {
      if (requestRef.current) return false;
      const run = async () => {
        if (requestRef.current) return false;
        let saved: ReportStore;
        try {
          saved = readReportStore(localStorage.getItem(key));
        } catch {
          setStorageError(
            "Reports could not be read. Existing report data is preserved.",
          );
          return false;
        }
        const entry = entriesRef.current[date];
        if (!hasReportEntry(entry) && !options?.draft.trim()) {
          if (force) setError("Save a daily entry or type a report first.");
          return false;
        }
        const source = reportSource(date, entry, saved.template);
        const previous = saved.reports[date];
        const attempt = `${date}:${source}`;
        if (
          !force &&
          (previous?.sentAt ||
            previous?.editedAt ||
            previous?.source === source ||
            attempted.current.has(attempt))
        )
          return false;
        const style = options?.style ?? previous?.style ?? "professional";
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
            body: JSON.stringify({
              date,
              entry,
              template: saved.template,
              style,
              instructions: options?.instructions ?? "",
              draft: options?.draft ?? "",
            }),
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
            result.style !== style ||
            typeof result.text !== "string" ||
            !result.text.trim() ||
            result.text.length > REPORT_TEXT_LIMIT
          )
            throw new Error("Could not verify the generated report.");
          const savedResult = change((latest) => {
            // A response for an older entry/template must never replace a newer draft
            // or a confirmation recorded while the AI was still running.
            if (
              reportSource(date, entriesRef.current[date], latest.template) !==
                source ||
              !canReplaceReport(latest.reports[date], previous)
            )
              throw new ReportConflictError(
                "Your entries or report changed while AI was writing. Your current text is kept; try rewriting again.",
              );
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
                  editedAt:
                    previous?.editedAt ||
                    (options?.draft && options.draft !== (previous?.text ?? "")
                      ? new Date().toISOString()
                      : undefined),
                  style,
                },
              },
            };
          });
          return savedResult;
        } catch (failure) {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not generate the report. Try again.",
            );
          return false;
        } finally {
          if (!controller.signal.aborted) {
            requestRef.current = null;
            setBusy(null);
          }
        }
      };
      // One automatic request per day/source across tabs on browsers with Web Locks.
      if (navigator.locks) {
        return await navigator.locks.request(
          `${key}:generate`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) return await run();
            else if (force)
              setError(
                "A report is being generated in another Daylight tab. Please wait.",
              );
            return false;
          },
        );
      } else return await run();
    },
    [key, userId, change],
  );

  useEffect(() => {
    if (
      !store ||
      busy ||
      editingDate === today ||
      !hasReportEntry(entries[today])
    )
      return;
    const timer = setTimeout(() => {
      void generate(today);
    }, 1800);
    return () => clearTimeout(timer);
  }, [store, entries, today, busy, generate, editingDate]);

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
    saveText: (date: string, text: string, expectedText: string) =>
      change((latest) =>
        editReportText(
          latest,
          date,
          text,
          expectedText,
          reportSource(date, entriesRef.current[date], latest.template),
          new Date().toISOString(),
        ),
      ),
    saveTemplate: (template: string) =>
      change((latest) => ({ ...latest, template })),
  };
}
