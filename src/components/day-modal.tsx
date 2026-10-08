"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { addDays, format } from "date-fns";
import { dailyHours, buildDailyEntry } from "@/lib/day-editor";
import { ArrowRight, BookOpen, Check, Clock3, Sun, X } from "lucide-react";
import TaskEditor from "./task-editor";
import DailyQuoteArea from "./daily-quote";
import {
  clockLabel,
  dateKey,
  durationLabel,
  isHoliday,
  WORK_MINUTES,
  WORK_START,
  type DayEntry,
  type LearningTask,
} from "@/lib/activity";

type Props = {
  date: Date;
  entry?: DayEntry;
  onClose: () => void;
  onSave: (
    key: string,
    entry: DayEntry,
    expected?: string,
  ) => { ok: boolean; message: string };
  onCarry: (
    source: string,
    target: string,
    ids: string[],
    expected: string,
  ) => { ok: boolean; message: string };
  onNotice: (message: string) => void;
};
export default function DayModal({
  date,
  entry,
  onClose,
  onSave,
  onNotice,
  onCarry,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const baseline = useRef(JSON.stringify(entry ?? null));
  const [carryDate, setCarryDate] = useState(dateKey(addDays(date, 1)));
  const [hours, setHours] = useState(() => dailyHours(entry));
  const [holiday, setHoliday] = useState(isHoliday(date, entry));
  const [tasks, setTasks] = useState<LearningTask[]>(() => entry?.tasks ?? []);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (confirmClose || confirmClear) {
      confirmation.current?.scrollIntoView({ block: "nearest" });
      confirmation.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [confirmClose, confirmClear]);
  const [error, setError] = useState("");
  const initialHours = dailyHours(entry);
  const dirty =
    hours !== initialHours ||
    holiday !== isHoliday(date, entry) ||
    JSON.stringify(tasks) !== JSON.stringify(entry?.tasks ?? []);
  function requestClose() {
    setConfirmClear(false);
    if (dirty) setConfirmClose(true);
    else onClose();
  }
  const valid =
    hours.trim() !== "" &&
    Number.isFinite(Number(hours)) &&
    Number(hours) >= 0 &&
    Number(hours) <= 9;
  const study = valid ? Math.round(Number(hours) * 60) : 0;
  const misc = WORK_MINUTES - study;
  const tasksOnly = tasks.length > 0 && !hours.trim();
  useEffect(() => {
    const node = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (node && !node.open) node.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (node?.open) node.close();
      document.body.style.overflow = previous;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLButtonElement>(".log-today")
          ?.focus({ preventScroll: true });
    };
  }, []);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    let next: DayEntry;
    try {
      next = buildDailyEntry(dateKey(date), entry, tasks, hours, holiday);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your daily hours.");
      return;
    }
    const result = onSave(dateKey(date), next, baseline.current);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onNotice(
      tasksOnly && !holiday && result.message === "Your day is saved."
        ? "Tasks saved. Add your learning hours whenever you're ready."
        : result.message,
    );
    onClose();
  }
  function clear() {
    const result = onSave(
      dateKey(date),
      {
        studyMinutes: 0,
        remark: "",
        holiday,
        logged: false,
        tasks: [],
        timeMode: "manual",
        focusSessions: entry?.focusSessions ?? [],
      },
      baseline.current,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onNotice("Daily entry cleared.");
    onClose();
  }
  return (
    <motion.dialog
      ref={dialog}
      className="day-dialog"
      aria-labelledby="day-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal-card learning-day-modal"
        initial={{ y: 30, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 20, scale: 0.98 }}
        transition={{ type: "spring", damping: 30, stiffness: 350 }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">MAKE THE DAY COUNT</span>
            <h2 id="day-title">{format(date, "EEEE, d MMMM")}</h2>
            <p>
              {format(date, "yyyy")} <span className="mx-2">/</span> 9:00 AM –
              6:00 PM
            </p>
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
        <DailyQuoteArea date={dateKey(date)} />
        <form onSubmit={submit}>
          <TaskEditor tasks={tasks} onChange={setTasks} />
          {!!entry?.tasks?.some((task) => task.status !== "completed") && (
            <div className="carry-panel">
              <div>
                <strong>Continue on another day</strong>
                <p>
                  Copy unfinished tasks with zero time. Your original day stays
                  in your history.
                </p>
              </div>
              <label>
                Destination
                <input
                  type="date"
                  value={carryDate}
                  onChange={(event) => setCarryDate(event.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={dirty || !carryDate || carryDate === dateKey(date)}
                onClick={() => {
                  const result = onCarry(
                    dateKey(date),
                    carryDate,
                    (entry?.tasks ?? [])
                      .filter((task) => task.status !== "completed")
                      .map((task) => task.id),
                    baseline.current,
                  );
                  if (result.ok) onNotice(result.message);
                  else setError(result.message);
                }}
              >
                Carry unfinished tasks
              </button>
              {dirty && (
                <small>
                  Save your edits and reopen this day before carrying tasks.
                </small>
              )}
            </div>
          )}
          <details className="daily-details" open>
            <summary>
              <span>
                <Clock3 size={17} /> Daily learning time
              </span>
              <small>
                {valid
                  ? `${durationLabel(study)} learning`
                  : "Hours optional when planning tasks"}
              </small>
            </summary>
            <div className="daily-details-body">
              <div className="holiday-control">
                <span>
                  <Sun size={19} /> Take a day off{" "}
                  <small>Mark this date as a holiday</small>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={holiday}
                  aria-label="Mark as holiday"
                  className={`switch ${holiday ? "on" : ""}`}
                  onClick={() => setHoliday(!holiday)}
                >
                  <span />
                </button>
              </div>
              {!holiday ? (
                <>
                  <label className="field-label" htmlFor="learning-hours">
                    Learning hours <span>out of 9 hours</span>
                  </label>
                  <div className="hours-input">
                    <BookOpen size={24} />
                    <input
                      id="learning-hours"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="9"
                      step="any"
                      value={hours}
                      onChange={(e) => {
                        setHours(e.target.value);
                        setError("");
                      }}
                      placeholder="0"
                      aria-describedby="hours-help"
                    />
                    <span>hours</span>
                  </div>
                  <p className="field-help" id="hours-help">
                    Enter 0–9 hours, or leave blank to save tasks without
                    logging a working day. Include any saved focus time.
                  </p>
                  <div className="quick-hours">
                    {[2, 4, 6, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={
                          Number(hours) === n && hours !== "" ? "active" : ""
                        }
                        onClick={() => {
                          setHours(String(n));
                          setError("");
                        }}
                      >
                        {n} hours
                      </button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor="hours-slider">
                    Adjust learning time
                  </label>
                  <input
                    className="hours-slider"
                    id="hours-slider"
                    type="range"
                    min="0"
                    max="540"
                    step="15"
                    value={study}
                    onChange={(e) =>
                      setHours(String(Number(e.target.value) / 60))
                    }
                  />
                  <div className="allocation">
                    <div>
                      <span>
                        <i className="dot study" />
                        Learning
                      </span>
                      <strong>{durationLabel(study)}</strong>
                    </div>
                    <div>
                      <span>
                        <i className="dot misc" />
                        Miscellaneous
                      </span>
                      <strong>{valid ? durationLabel(misc) : "—"}</strong>
                    </div>
                  </div>
                  <div className="progress-track">
                    <motion.div
                      className="study-fill"
                      animate={{ width: `${(study / WORK_MINUTES) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="timeline-note">
                    <Clock3 size={15} />
                    <span>
                      {valid
                        ? `${clockLabel(WORK_START)} → ${clockLabel(WORK_START + study)} Study · ${clockLabel(WORK_START + study)} → 6:00 PM Miscellaneous`
                        : "Your time allocation will appear here."}
                    </span>
                  </div>
                </>
              ) : (
                <div className="holiday-message">
                  <Sun size={33} />
                  <h3>A little room to recharge.</h3>
                  <p>
                    This day contributes 0 hours to your monthly totals. Saved
                    learning time returns when you switch back to a working day.
                  </p>
                </div>
              )}
            </div>
          </details>
          {confirmClose && (
            <div className="draft-confirm" role="alert" ref={confirmation}>
              <strong>You have unsaved changes.</strong>
              <span>Save your day below, or discard this draft.</span>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmClose(false)}
                >
                  Keep editing
                </button>
                <button type="button" className="text-button" onClick={onClose}>
                  Discard changes
                </button>
              </div>
            </div>
          )}
          {confirmClear && (
            <div className="draft-confirm" role="alert" ref={confirmation}>
              <strong>Clear this day&apos;s saved tasks and hours?</strong>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmClear(false)}
                >
                  Keep entry
                </button>
                <button type="button" className="text-button" onClick={clear}>
                  Clear this day
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-footer">
            <button
              type="button"
              className="text-button"
              disabled={
                !entry?.logged && !entry?.tasks?.length && !entry?.remark
              }
              onClick={() => {
                setConfirmClose(false);
                setConfirmClear(true);
              }}
            >
              Clear entry
            </button>
            <button type="submit" className="primary-button">
              <Check size={17} />
              {tasksOnly && !holiday ? "Save tasks" : "Save day & tasks"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </motion.div>
    </motion.dialog>
  );
}
