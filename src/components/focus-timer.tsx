"use client";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Timer, Check } from "lucide-react";
import { elapsedSeconds } from "@/lib/learning";
import { validDateKey, type Entries } from "@/lib/activity";

type TimerState = {
  id: string;
  target: string;
  seconds: number;
  startedAt: number | null;
};
const KEY = "daylight.focus.v1";
const blank = (): TimerState => ({
  id: crypto.randomUUID(),
  target: "",
  seconds: 0,
  startedAt: null,
});
export default function FocusTimer({
  entries,
  onSave,
}: {
  entries: Entries;
  onSave: (
    day: string,
    task: string,
    minutes: number,
    session: string,
  ) => { ok: boolean; message: string };
}) {
  const [timer, setTimer] = useState<TimerState>({
    id: "",
    target: "",
    seconds: 0,
    startedAt: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("");
  const [resetting, setResetting] = useState(false);
  const choices = Object.entries(entries)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([day, entry]) =>
      (entry.tasks ?? [])
        .filter((task) => task.status !== "completed")
        .map((task) => ({
          value: `${day}::${task.id}`,
          label: `${day} · ${task.title}`,
        })),
    );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (
        value &&
        typeof value.id === "string" &&
        typeof value.target === "string" &&
        Number.isInteger(value.seconds) &&
        value.seconds >= 0 &&
        (value.startedAt === null ||
          (Number.isFinite(value.startedAt) && value.startedAt > 0))
      )
        setTimer(value);
      else setTimer(blank());
    } catch {
      setTimer(blank());
    }
    setNow(Date.now());
    setLoaded(true);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    function onStorage(event: StorageEvent) {
      if (event.key !== KEY || !event.newValue) return;
      try {
        const value = JSON.parse(event.newValue);
        if (
          typeof value.id === "string" &&
          typeof value.target === "string" &&
          Number.isInteger(value.seconds) &&
          value.seconds >= 0 &&
          (value.startedAt === null ||
            (Number.isFinite(value.startedAt) && value.startedAt > 0))
        ) {
          setTimer(value);
          setNow(Date.now());
        }
      } catch {
        /* keep the current timer */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(tick);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem(KEY, JSON.stringify(timer));
      } catch {
        setMessage(
          "Timer is kept for this session only; browser storage is unavailable.",
        );
      }
  }, [loaded, timer]);
  const seconds = elapsedSeconds(timer, now);
  const targetExists = choices.some((choice) => choice.value === timer.target);
  function pause() {
    setTimer((old) => ({
      ...old,
      seconds: elapsedSeconds(old, Date.now()),
      startedAt: null,
    }));
  }
  function save() {
    const snapshot = timer;
    const elapsed = elapsedSeconds(snapshot, Date.now());
    const day = snapshot.target.slice(0, 10),
      task = snapshot.target.slice(12);
    if (!validDateKey(day)) return;
    const result = onSave(day, task, Math.floor(elapsed / 60), snapshot.id);
    setMessage(result.message);
    if (result.ok)
      setTimer({ ...blank(), target: snapshot.target, seconds: elapsed % 60 });
    else pause();
  }
  return (
    <section className="focus-card" aria-labelledby="focus-heading">
      <div className="feature-heading">
        <Timer size={20} />
        <h3 id="focus-heading">Your focus space</h3>
        <span className={`live-pill ${timer.startedAt ? "running" : ""}`}>
          {timer.startedAt ? "Focusing" : "Ready when you are"}
        </span>
      </div>
      <label className="sr-only" htmlFor="focus-task">
        Task to focus on
      </label>
      <select
        id="focus-task"
        value={timer.target}
        disabled={seconds > 0 || timer.startedAt !== null}
        onChange={(event) =>
          setTimer({ ...blank(), target: event.target.value })
        }
      >
        <option value="">Choose a saved unfinished task</option>
        {!targetExists && timer.target && (
          <option value={timer.target}>
            Previous task (no longer unfinished)
          </option>
        )}
        {choices.map((choice) => (
          <option value={choice.value} key={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <div className={`timer-visual ${timer.startedAt ? "is-running" : ""}`}>
        <span className="timer-orbit" aria-hidden="true" />
        <strong
          aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`}
        >
          {String(Math.floor(seconds / 60)).padStart(2, "0")}
          <span>:</span>
          {String(seconds % 60).padStart(2, "0")}
        </strong>
        <small>
          {Math.max(0, 25 - Math.floor(seconds / 60))
            ? `${Math.max(0, 25 - Math.floor(seconds / 60))} min to a 25-minute focus block`
            : "Focus block complete. Take a breath."}
        </small>
      </div>
      <div className="timer-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!loaded || (!timer.startedAt && !targetExists)}
          onClick={() =>
            timer.startedAt
              ? pause()
              : setTimer((old) => ({ ...old, startedAt: Date.now() }))
          }
        >
          {timer.startedAt ? <Pause size={16} /> : <Play size={16} />}
          {timer.startedAt ? "Pause" : "Start focus"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={seconds < 60}
          onClick={save}
        >
          <Check size={16} />
          Save minutes
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Reset focus timer"
          disabled={!seconds && !timer.startedAt}
          onClick={() => {
            pause();
            setResetting(true);
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {resetting && (
        <div className="timer-reset">
          <span>Discard unsaved focus time?</span>
          <button
            type="button"
            onClick={() => {
              setTimer({ ...blank(), target: timer.target });
              setResetting(false);
            }}
          >
            Discard
          </button>
          <button type="button" onClick={() => setResetting(false)}>
            Keep time
          </button>
        </div>
      )}
      <p className="field-help">
        Save complete minutes to the selected task. Remaining seconds stay on
        the timer. Time continues across refreshes.
      </p>
      {message && (
        <p className="feature-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
