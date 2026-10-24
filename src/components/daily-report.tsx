"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import {
  Bell,
  Check,
  Copy,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { Entries } from "@/lib/activity";
import { formatTimestamp } from "@/lib/clock";
import { downloadText } from "@/lib/exports";
import {
  DEFAULT_REPORT_TEMPLATE,
  hasReportEntry,
  reportSource,
  REPORT_TEMPLATE_LIMIT,
  REPORT_TIME_ZONE,
  REPORT_TEXT_LIMIT,
  REPORT_INSTRUCTION_LIMIT,
  REPORT_STYLES,
  type ReportStyle,
} from "@/lib/daily-report";
import { useDailyReports } from "@/hooks/use-daily-reports";

export default function DailyReportSection({
  entries,
  userId,
}: {
  entries: Entries;
  userId: string;
}) {
  const [edit, setEdit] = useState<{
    date: string;
    text: string;
    baseText: string;
  } | null>(null);
  const [preferences, setPreferences] = useState<{
    date: string;
    style: ReportStyle;
    instructions: string;
  } | null>(null);
  const reports = useDailyReports(
    userId,
    entries,
    edit?.date ?? preferences?.date,
  );
  const { store, today, busy, reminderDate } = reports;
  const [selectedDate, setSelectedDate] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const date = selectedDate || today;
  const report = store?.reports[date];
  const text = edit?.date === date ? edit.text : (report?.text ?? "");
  const style =
    preferences?.date === date
      ? preferences.style
      : (report?.style ?? "professional");
  const instructions =
    preferences?.date === date ? preferences.instructions : "";
  const isEditing = edit?.date === date;
  const sent = Boolean(report?.sentAt && !isEditing);
  const outdated = Boolean(
    report?.text &&
    store &&
    report.source !== reportSource(date, entries[date], store.template),
  );
  const savedDates = Object.keys(store?.reports ?? {})
    .filter((day) => store?.reports[day].text || store?.reports[day].sentAt)
    .sort()
    .reverse();
  const canGenerate = hasReportEntry(entries[date]) || Boolean(text.trim());

  useEffect(() => {
    if (!edit) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [edit]);

  function saveEdits() {
    if (!edit) return true;
    if (!reports.saveText(edit.date, edit.text, edit.baseText)) return false;
    setEdit(null);
    return true;
  }
  function selectDate(next: string) {
    if (busy || !saveEdits()) return;
    setSelectedDate(next);
    setPreferences(null);
    setMessage("");
  }
  function confirmSent(day: string) {
    if (!saveEdits()) return;
    if (reports.markSent(day))
      setMessage("You confirmed that you sent this report.");
  }
  function updatePreferences(
    changes: Partial<{ style: ReportStyle; instructions: string }>,
  ) {
    setPreferences({ date, style, instructions, ...changes });
  }
  async function rewrite() {
    if (
      await reports.generate(date, true, { style, instructions, draft: text })
    ) {
      setEdit(null);
      setPreferences(null);
      setMessage(
        `AI updated your report in the ${REPORT_STYLES[style].label.toLowerCase()} style.`,
      );
    }
  }

  function openReport() {
    if (!saveEdits()) return;
    setSelectedDate(today);
    reports.dismissReminder();
    requestAnimationFrame(() => {
      const section = document.getElementById("daily-report-section");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      document
        .getElementById("daily-report-title")
        ?.focus({ preventScroll: true });
    });
  }
  return (
    <section
      id="daily-report-section"
      className="daily-report-section feature-card"
      aria-labelledby="daily-report-title"
    >
      <div className="daily-report-heading">
        <div className="daily-report-symbol">
          <FileText size={23} />
        </div>
        <div>
          <span className="eyebrow">YOUR DAY, IN WORDS</span>
          <h2 id="daily-report-title" tabIndex={-1}>
            Daily Progress Report
          </h2>
          <p>
            A report from your saved entries, ready for you to review and share.
          </p>
        </div>
        <span className={`report-status ${sent ? "sent" : ""}`}>
          {sent ? <Check size={14} /> : <Bell size={14} />}
          {sent ? "Marked sent" : "Not marked sent"}
        </span>
      </div>
      <div className="daily-report-toolbar">
        <label htmlFor="daily-report-date">
          Report date
          <input
            id="daily-report-date"
            type="date"
            value={date}
            max={today}
            disabled={Boolean(busy)}
            onChange={(e) => {
              if (e.target.value) {
                selectDate(e.target.value);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="text-button"
          disabled={Boolean(busy)}
          onClick={() => selectDate("")}
        >
          Today
        </button>
        <span>
          <Sparkles size={14} /> AI drafts from your entries. You can edit the
          text or ask for a rewrite.
        </span>
      </div>
      <div className="daily-report-layout">
        <div className="daily-report-document" aria-busy={busy === date}>
          <label
            htmlFor="daily-report-text"
            className="daily-report-editor-label"
          >
            Your report
            <span>
              {isEditing
                ? "Unsaved changes"
                : report?.editedAt
                  ? "Your edits are saved"
                  : "Edit or paste your update here"}
            </span>
          </label>
          <textarea
            id="daily-report-text"
            className="daily-report-text"
            rows={20}
            maxLength={REPORT_TEXT_LIMIT}
            value={text}
            disabled={!store || Boolean(busy)}
            placeholder="Write your daily progress here, or let AI draft it from your saved activities."
            onChange={(event) => {
              const baseText =
                edit?.date === date ? edit.baseText : (report?.text ?? "");
              setEdit(
                event.target.value === baseText
                  ? null
                  : { date, text: event.target.value, baseText },
              );
              setMessage("");
            }}
          />
          <div className="daily-report-edit-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!isEditing || Boolean(busy)}
              onClick={() => {
                if (saveEdits()) setMessage("Your report changes are saved.");
              }}
            >
              Save changes
            </button>
            {isEditing && (
              <button
                type="button"
                className="text-button"
                disabled={Boolean(busy)}
                onClick={() => setEdit(null)}
              >
                Discard edits
              </button>
            )}
            <small>
              {text.length.toLocaleString()} /{" "}
              {REPORT_TEXT_LIMIT.toLocaleString()} characters
            </small>
          </div>
          <form
            className="daily-report-rewrite"
            onSubmit={(event) => {
              event.preventDefault();
              void rewrite();
            }}
          >
            <fieldset disabled={!store || Boolean(busy)}>
              <legend>How should AI write it?</legend>
              <div className="daily-report-styles">
                {(
                  Object.entries(REPORT_STYLES) as [
                    ReportStyle,
                    (typeof REPORT_STYLES)[ReportStyle],
                  ][]
                ).map(([key, option]) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={style === key}
                    onClick={() => updatePreferences({ style: key })}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              <label htmlFor="daily-report-instructions">
                Tell AI what to change <span>(optional)</span>
                <input
                  id="daily-report-instructions"
                  type="text"
                  value={instructions}
                  maxLength={REPORT_INSTRUCTION_LIMIT}
                  placeholder="For example: keep it brief and highlight what is still unfinished."
                  onChange={(event) =>
                    updatePreferences({ instructions: event.target.value })
                  }
                />
              </label>
              <button className="primary-button" disabled={!canGenerate}>
                <RefreshCw
                  size={16}
                  className={busy === date ? "google-sync-spinner" : ""}
                />
                {busy === date
                  ? "AI is writing…"
                  : text.trim()
                    ? "Rewrite with AI"
                    : "Generate with AI"}
              </button>
            </fieldset>
          </form>
          {report?.generatedAt && (
            <p className="daily-report-stamp">
              Generated {formatTimestamp(report.generatedAt, REPORT_TIME_ZONE)}{" "}
              IST
            </p>
          )}
        </div>
        <aside className="daily-report-controls">
          <div className="daily-report-reminder-info">
            <Bell size={18} />
            <h3>Your 5:00 PM check-in</h3>
            <p>
              At 5:00 PM IST, a popup reminds you if today’s report is not
              marked sent. Confirm after you send it yourself.
            </p>
            <small>
              Keep Daylight open for the popup. Returning after 5:00 PM shows
              today’s missed reminder. Reports and confirmations are saved for
              this account on this browser.
            </small>
          </div>
          {outdated && (
            <p className="daily-report-notice" role="status">
              {report?.sentAt
                ? "Entries or the template changed after this report was marked sent. Generate an updated draft to review and confirm again."
                : "The entries or template changed. This draft is awaiting an update."}
            </p>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={!text.trim()}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setMessage("Report copied.");
              } catch {
                setMessage(
                  "Copy is unavailable. Select the report text or download it.",
                );
              }
            }}
          >
            <Copy size={16} />
            Copy report
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!text.trim()}
            onClick={() =>
              downloadText(
                `Daily_Progress_Report_${date}.txt`,
                text,
                "text/plain;charset=utf-8",
              )
            }
          >
            <Download size={16} />
            Download report
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!store || Boolean(busy)}
            onClick={() => {
              if (report?.sentAt && !isEditing) {
                if (reports.markSent(date, false))
                  setMessage("Report marked as not sent.");
              } else confirmSent(date);
            }}
          >
            <Check size={16} />
            {report?.sentAt && !isEditing
              ? "Mark as not sent"
              : "I’ve sent this report"}
          </button>
          {report?.sentAt && sent && (
            <small className="daily-report-confirmed">
              Confirmed {formatTimestamp(report.sentAt, REPORT_TIME_ZONE)} IST
            </small>
          )}
        </aside>
      </div>
      <details className="daily-report-template">
        <summary>Report template</summary>
        <p>
          Matches your numbered activity and bullet-point format. Sample details
          in a template are used for style; the report’s facts come from your
          saved entry.
        </p>
        <label htmlFor="daily-report-template">
          Template
          <textarea
            id="daily-report-template"
            rows={12}
            maxLength={REPORT_TEMPLATE_LIMIT}
            value={template ?? store?.template ?? DEFAULT_REPORT_TEMPLATE}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </label>
        <div className="daily-report-template-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!store || !(template ?? store.template).trim()}
            onClick={() => {
              if (reports.saveTemplate((template ?? store!.template).trim())) {
                setTemplate(null);
                setMessage(
                  "Template saved. Today’s unsent draft will update from your entries.",
                );
              }
            }}
          >
            Save template
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setTemplate(DEFAULT_REPORT_TEMPLATE)}
          >
            Use original format
          </button>
        </div>
      </details>
      {savedDates.length > 0 && (
        <details className="daily-report-history">
          <summary>Report history ({savedDates.length})</summary>
          <div>
            {savedDates.map((day) => (
              <button
                type="button"
                key={day}
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() => selectDate(day)}
              >
                {format(parseISO(day), "d MMM yyyy")} ·{" "}
                {store!.reports[day].sentAt ? "Marked sent" : "Draft"}
              </button>
            ))}
          </div>
        </details>
      )}
      <p className="daily-report-feedback" role="status">
        {reports.storageError || reports.error || message}
      </p>
      {reminderDate && (
        <ReportReminderDialog
          date={reminderDate}
          error={reports.storageError}
          onReview={openReport}
          onSent={() => {
            confirmSent(reminderDate);
          }}
          onSnooze={() => reports.dismissReminder(true)}
          onDismiss={() => reports.dismissReminder()}
        />
      )}
    </section>
  );
}

function ReportReminderDialog({
  date,
  error,
  onReview,
  onSent,
  onSnooze,
  onDismiss,
}: {
  date: string;
  error: string;
  onReview: () => void;
  onSent: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="report-reminder-dialog"
      aria-labelledby="report-reminder-title"
      aria-describedby="report-reminder-description"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <div className="daily-report-symbol">
        <Bell size={26} />
      </div>
      <span className="eyebrow">5:00 PM IST · DAILY CHECK-IN</span>
      <h2 id="report-reminder-title">Your daily report isn’t marked sent</h2>
      <p id="report-reminder-description">
        Review your report for {format(parseISO(date), "d MMMM yyyy")}. After
        sending it yourself, confirm here.
      </p>
      <div className="report-reminder-actions">
        <button type="button" className="primary-button" onClick={onReview}>
          Review daily report
        </button>
        <button type="button" className="secondary-button" onClick={onSent}>
          <Check size={16} />
          I’ve sent it
        </button>
        <button type="button" className="secondary-button" onClick={onSnooze}>
          Remind me in 10 minutes
        </button>
        <button type="button" className="text-button" onClick={onDismiss}>
          Dismiss for today
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </dialog>,
    document.body,
  );
}
