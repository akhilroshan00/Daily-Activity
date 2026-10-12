"use client";
import { useEffect, useState } from "react";
import { dateKey } from "@/lib/activity";
import { workspaceKeys } from "@/lib/workspace-storage";
import {
  reminderOccurrence,
  validReminder,
  type Reminder,
} from "@/lib/reminders";
export default function Reminders({
  userId,
  visible,
}: {
  userId: string;
  visible: boolean;
}) {
  const key = `${workspaceKeys(userId).activity}:reminders.v1`;
  const [items, setItems] = useState<Reminder[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [due, setDue] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [time, setTime] = useState("09:00");
  const [repeat, setRepeat] = useState<Reminder["repeat"]>("once");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      if (
        !Array.isArray(saved) ||
        saved.length > 100 ||
        !saved.every(validReminder)
      )
        throw new Error();
      setItems(saved);
      setReady(true);
    } catch {
      setMessage(
        "Reminders could not be loaded. Browser storage must be available.",
      );
    }
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(key) || "[]");
        if (!Array.isArray(saved) || !saved.every(validReminder)) return;
        const incoming: Reminder[] = [];
        const updated = saved.map((r) => {
          const occurrence = reminderOccurrence(r, new Date());
          if (!occurrence || occurrence === r.seen) return r;
          incoming.push(r);
          return { ...r, seen: occurrence };
        });
        if (incoming.length) {
          localStorage.setItem(key, JSON.stringify(updated));
          setDue((old) => [
            ...old.filter((r) => !incoming.some((n) => n.id === r.id)),
            ...incoming,
          ]);
          if ("Notification" in window && Notification.permission === "granted")
            for (const r of incoming) {
              try {
                new Notification("Daylight reminder", {
                  body: r.title,
                  tag: r.id,
                });
              } catch {
                /* in-app reminder still appears */
              }
            }
        }
        setItems(updated);
      } catch {
        setMessage("Could not save reminder delivery. Check browser storage.");
      }
    };
    check();
    const timer = setInterval(check, 15000);
    window.addEventListener("focus", check);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, [key, ready]);
  function save(next: Reminder[]) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setItems(next);
      return true;
    } catch {
      setMessage("Could not save. Check browser storage.");
      return false;
    }
  }
  return (
    <>
      {due.length > 0 && (
        <div className="feature-card reminder-alert" role="status">
          <strong>Reminders</strong>
          {due.map((r) => (
            <p key={r.id}>
              {r.title}{" "}
              <button
                className="secondary-button"
                onClick={() =>
                  setDue((old) => old.filter((i) => i.id !== r.id))
                }
              >
                Dismiss
              </button>
            </p>
          ))}
        </div>
      )}
      {visible && (
        <div className="feature-card assistant-card">
          <h3>Reminders</h3>
          <p>
            Once, every day, or every month at your chosen local time. Reminders
            are saved on this browser for your account. Keep the app open for
            timely alerts; missed alerts appear when you return.
          </p>
          <form
            className="assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              const r: Reminder = {
                id: crypto.randomUUID(),
                title: title.trim(),
                date,
                time,
                repeat,
                enabled: true,
              };
              if (!validReminder(r) || items.length >= 100) {
                setMessage(
                  "Enter a reminder, date and time. Maximum 100 reminders.",
                );
                return;
              }
              if (new Date(`${date}T${time}`) <= new Date()) {
                setMessage("Choose a future start date and time.");
                return;
              }
              if (save([...items, r])) {
                setTitle("");
                setMessage("Reminder saved.");
              }
            }}
          >
            <label>
              Remind me
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What would you like to remember?"
              />
            </label>
            <div className="assistant-fields">
              <label>
                Start date
                <input
                  required
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Time
                <input
                  required
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <label>
                Repeat
                <select
                  value={repeat}
                  onChange={(e) =>
                    setRepeat(e.target.value as Reminder["repeat"])
                  }
                >
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
            </div>
            <button className="primary-button" disabled={!ready}>
              Add reminder
            </button>
          </form>
          <button
            className="secondary-button"
            onClick={async () => {
              if (!("Notification" in window)) {
                setMessage("Use the in-app alerts on this browser.");
                return;
              }
              try {
                const permission = await Notification.requestPermission();
                setMessage(
                  permission === "granted"
                    ? "Browser notifications enabled."
                    : "In-app alerts remain available. Browser notifications are not enabled.",
                );
              } catch {
                setMessage("Use the in-app alerts on this browser.");
              }
            }}
          >
            Enable browser notifications
          </button>
          <p>
            Monthly reminders on the 29th–31st use the last day of shorter
            months.
          </p>
          {items.map((r) => (
            <div className="reminder-row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <p>
                  {r.date} · {r.time} · {r.repeat}
                  {!r.enabled ? " · Paused" : ""}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  save(
                    items.map((i) =>
                      i.id === r.id ? { ...i, enabled: !i.enabled } : i,
                    ),
                  )
                }
              >
                {r.enabled ? "Pause" : "Resume"}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  if (save(items.filter((i) => i.id !== r.id)))
                    setDue((old) => old.filter((i) => i.id !== r.id));
                }}
              >
                Delete
              </button>
            </div>
          ))}
          <p role="status">{message}</p>
        </div>
      )}
    </>
  );
}
