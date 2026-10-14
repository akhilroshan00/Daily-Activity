"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Check, X } from "lucide-react";
import {
  dateKey,
  durationLabel,
  isHoliday,
  type DayEntry,
} from "@/lib/activity";
import {
  buildSimpleDay,
  legacyActivityLog,
  type DayType,
} from "@/lib/simple-day";
import {
  dayTimeTotals,
  validateActivities,
  learningTotal,
  effectiveTimeLog,
} from "@/lib/time-log";
import TimeLogEditor from "./time-log-editor";

type Props = {
  date: Date;
  entry?: DayEntry;
  onClose: () => void;
  onSave: (
    key: string,
    entry: DayEntry,
    expected?: string,
  ) => { ok: boolean; message: string };
  onNotice: (message: string) => void;
};
export default function DayModal({
  date,
  entry,
  onClose,
  onSave,
  onNotice,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const baseline = useRef(JSON.stringify(entry ?? null));
  const initialType: DayType = entry?.leave
    ? "leave"
    : isHoliday(date, entry)
      ? "holiday"
      : "working";
  const [type, setType] = useState<DayType>(initialType);
  const initialLog = entry?.timeLog
    ? {
        ...entry.timeLog,
        blocks: entry.timeLog.blocks.filter(
          (b) => !b.id.startsWith("unassigned:misc"),
        ),
      }
    : undefined;
  const [log, setLog] = useState(initialLog);
  const [remark, setRemark] = useState(entry?.remark ?? "");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || confirmClose)
      feedback.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [error, confirmClose]);
  const changed = JSON.stringify(log) !== JSON.stringify(entry?.timeLog);
  const dirty =
    changed || type !== initialType || remark !== (entry?.remark ?? "");
  const study =
    log && (changed || entry?.timeMode === "activities")
      ? learningTotal(log)
      : dayTimeTotals(entry).study;
  const totals = dayTimeTotals({
    ...entry,
    studyMinutes: study,
    remark,
    logged: true,
    timeLog: log,
  });
  const hasTime = log
    ? Boolean(log.blocks.length || log.extraFreeMinutes)
    : (entry?.logged ?? false);
  let logValid = true;
  try {
    if (log) validateActivities(log);
  } catch {
    logValid = false;
  }
  const validTotals =
    logValid &&
    study <= 540 &&
    [totals.work, totals.breaks, totals.free, totals.logged].every(
      (value) => Number.isFinite(value) && value >= 0,
    );
  const off = type !== "working";
  useEffect(() => {
    const node = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (node && !node.open) node.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (node?.open) node.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next = buildSimpleDay(dateKey(date), entry, log, type, remark);
      const result = onSave(dateKey(date), next, baseline.current);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onNotice(result.message);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check your activity times.",
      );
    }
  }
  return (
    <motion.dialog
      ref={dialog}
      className="day-dialog"
      aria-labelledby="day-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal-card learning-day-modal simple-day-modal"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">DAILY LOG</span>
            <h2 id="day-title">{format(date, "EEEE, d MMMM")}</h2>
            <p>{format(date, "yyyy")}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close daily editor"
            onClick={requestClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="simple-day-type">
            Day type
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value as DayType);
                setError("");
              }}
            >
              <option value="working">Working day</option>
              <option value="leave">Leave</option>
              <option value="holiday">Holiday</option>
            </select>
          </label>
          {off ? (
            <p className="simple-day-message">
              {type === "leave" ? "Leave" : "Holiday"} — no hours counted. Your
              saved activities are kept.
            </p>
          ) : (
            <>
              {!log && entry && (entry.logged || entry.tasks?.length) ? (
                <div className="simple-day-message">
                  <p>Your saved day is kept in history.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      const legacy = legacyActivityLog(entry);
                      setLog({
                        ...legacy,
                        blocks: legacy.blocks.filter(
                          (b) => !b.id.startsWith("unassigned:misc"),
                        ),
                      });
                      setError("");
                    }}
                  >
                    Edit time as activities
                  </button>
                </div>
              ) : (
                <TimeLogEditor
                  date={date}
                  log={log}
                  onChange={(next) => {
                    setLog(next);
                    setError("");
                  }}
                />
              )}
            </>
          )}
          <details className="simple-day-notes">
            <summary>Notes {remark ? "· saved" : "(optional)"}</summary>
            <label>
              <span className="sr-only">Day notes</span>
              <textarea
                rows={2}
                maxLength={500}
                value={remark}
                placeholder="Anything to remember?"
                onChange={(event) => setRemark(event.target.value)}
              />
            </label>
          </details>
          <div className="simple-day-totals" aria-live="polite">
            {[
              ["Learning", totals.study],
              ["Misc", totals.misc],
              ["Work", totals.work],
              ["Breaks", totals.breaks],
              ["Free", totals.free],
            ].map(([label, minutes]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {off || !hasTime
                    ? "0h"
                    : validTotals
                      ? durationLabel(Number(minutes))
                      : "—"}
                </strong>
              </div>
            ))}
          </div>
          <div ref={feedback} className="simple-day-feedback">
            {confirmClose && (
              <div className="draft-confirm" role="alert">
                <strong>Keep your changes?</strong>
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setConfirmClose(false)}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={onClose}
                  >
                    Discard changes
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer simple-day-footer">
            <span>
              {off || !hasTime
                ? "0h"
                : validTotals
                  ? durationLabel(totals.logged)
                  : "—"}{" "}
              total logged
            </span>
            <button type="submit" className="primary-button">
              <Check size={17} />
              Save day
            </button>
          </div>
        </form>
      </motion.div>
    </motion.dialog>
  );
}
