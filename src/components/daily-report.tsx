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
} from "@/lib/daily-report";
import { useDailyReports } from "@/hooks/use-daily-reports";

export default function DailyReportSection({
  entries,
  userId,
}: {
  entries: Entries;
  userId: string;
}) {
  const reports = useDailyReports(userId, entries);
  const { store, today, busy, reminderDate } = reports;
  const [selectedDate, setSelectedDate] = useState("");
  const [template, setTemplate] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const date = selectedDate || today;
  const report = store?.reports[date];
  const outdated = Boolean(
    report?.text &&
    store &&
    report.source !== reportSource(date, entries[date], store.template),
  );
  const savedDates = Object.keys(store?.reports ?? {})
    .filter((day) => store?.reports[day].text || store?.reports[day].sentAt)
    .sort()
    .reverse();
  const canGenerate = hasReportEntry(entries[date]);

  function openReport() {
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
        <span className={`report-status ${report?.sentAt ? "sent" : ""}`}>
          {report?.sentAt ? <Check size={14} /> : <Bell size={14} />}
          {report?.sentAt ? "Marked sent" : "Not marked sent"}
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
            onChange={(e) => {
              if (e.target.value) {
                setSelectedDate(e.target.value);
                setMessage("");
              }
            }}
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => setSelectedDate("")}
        >
          Today
        </button>
        <span>
          <Sparkles size={14} /> Today’s draft updates automatically after you
          save an entry.
        </span>
      </div>
      <div className="daily-report-layout">
        <div className="daily-report-document" aria-busy={busy === date}>
          {report?.text ? (
            <pre>{report.text}</pre>
          ) : (
            <div className="daily-report-empty">
              <FileText size={32} />
              <h3>
                {busy === date
                  ? "Writing your daily report…"
                  : "Your daily story starts here"}
              </h3>
              <p>
                {canGenerate
                  ? "Your saved activities are ready to become a report."
                  : "Save activities or notes for this date to create a report."}
              </p>
              <span>Numbered activities · Key Learnings · Summary</span>
            </div>
          )}
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
            className="primary-button"
            disabled={!store || Boolean(busy) || !canGenerate}
            onClick={() => {
              void reports.generate(date, true);
            }}
          >
            <RefreshCw
              size={16}
              className={busy === date ? "google-sync-spinner" : ""}
            />
            {busy === date
              ? "Writing report…"
              : report?.text
                ? "Generate updated draft"
                : "Generate report"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!report?.text}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report!.text);
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
            disabled={!report?.text}
            onClick={() =>
              downloadText(
                `Daily_Progress_Report_${date}.txt`,
                report!.text,
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
              if (reports.markSent(date, !report?.sentAt))
                setMessage(
                  report?.sentAt
                    ? "Report marked as not sent."
                    : "You confirmed that you sent this report.",
                );
            }}
          >
            <Check size={16} />
            {report?.sentAt ? "Mark as not sent" : "I’ve sent this report"}
          </button>
          {report?.sentAt && (
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
                onClick={() => setSelectedDate(day)}
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
            reports.markSent(reminderDate);
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
