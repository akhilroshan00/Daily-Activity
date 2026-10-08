"use client";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import {
  Flame,
  Target,
  ChartNoAxesCombined,
  Timer,
  ShieldCheck,
  Cloud,
} from "lucide-react";
import {
  durationLabel,
  hoursLabel,
  monthDays,
  monthTotals,
  type Entries,
} from "@/lib/activity";
import { learningStreak, weekLearning, addFocusMinutes } from "@/lib/learning";
import FocusTimer from "./focus-timer";
import BackupRestore from "./backup-restore";
import AccountSync from "./account-sync";
import { useWorkspace } from "./workspace-auth";
import { workspaceKeys } from "@/lib/workspace-storage";

export type UpdateEntries = (transform: (latest: Entries) => Entries) => {
  ok: boolean;
  message: string;
};
export default function LearningStudio({
  entries,
  year,
  updateEntries,
  onNotice,
}: {
  entries: Entries;
  year: number;
  updateEntries: UpdateEntries;
  onNotice: (message: string) => void;
}) {
  const { user } = useWorkspace();
  const keys = workspaceKeys(user.id);
  const [tab, setTab] = useState("insights");
  const [goal, setGoal] = useState(900);
  const [goalDraft, setGoalDraft] = useState("15");
  const [goalMessage, setGoalMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(keys.goal));
      if (saved > 0 && saved <= 3780 && Number.isInteger(saved)) {
        setGoal(saved);
        setGoalDraft(String(saved / 60));
      }
    } catch {
      /* default goal */
    }
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [keys.goal]);
  const week = weekLearning(entries, now);
  const weekMinutes = week.reduce((sum, day) => sum + day.minutes, 0);
  const annual = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(year, index, 1);
    const days = monthDays(date, entries);
    return { date, days, ...monthTotals(days) };
  });
  const tasks = annual.flatMap((month) =>
    month.days.flatMap((day) =>
      day.tasks.map((task) => ({
        ...task,
        date: day.key,
        holiday: day.holiday,
        logged: day.logged,
      })),
    ),
  );
  const subjects = new Map<string, number>();
  for (const task of tasks)
    if (!task.holiday && task.logged)
      subjects.set(
        task.subject?.trim() || "Uncategorised",
        (subjects.get(task.subject?.trim() || "Uncategorised") ?? 0) +
          (task.minutes ?? 0),
      );
  const subjectList = [...subjects]
    .filter(([, minutes]) => minutes > 0)
    .sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(60, ...annual.map((month) => month.studyMinutes));

  const top = annual.reduce(
    (best, month) => (month.studyMinutes > best.studyMinutes ? month : best),
    annual[0],
  );
  function saveGoal() {
    const hours = Number(goalDraft);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 63) {
      setGoalMessage("Choose a weekly target above 0 and up to 63 hours.");
      return;
    }
    const minutes = Math.round(hours * 60);
    if (minutes < 1) {
      setGoalMessage("Choose a goal of at least one minute.");
      return;
    }
    setGoal(minutes);
    try {
      localStorage.setItem(keys.goal, String(minutes));
      setGoalMessage("Weekly goal saved.");
    } catch {
      setGoalMessage("Goal updated for this session only.");
    }
  }
  return (
    <section className="learning-studio" aria-label="Learning tools">
      <div className="studio-heading">
        <div>
          <span className="eyebrow">YOUR LEARNING TOOLKIT</span>
          <h2>A little structure. A lot of possibility.</h2>
        </div>
        <span className="studio-label">DAYLIGHT STUDIO</span>
      </div>
      <div className="studio-tabs" aria-label="Learning tool selection">
        {[
          { id: "insights", label: "Insights", icon: ChartNoAxesCombined },
          { id: "focus", label: "Focus & goals", icon: Timer },
          { id: "backup", label: "Backups", icon: ShieldCheck },
          { id: "account", label: "Account & sync", icon: Cloud },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {tab === "insights" && (
        <motion.div
          className="insight-studio-grid"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="year-chart feature-card">
            <div className="feature-heading">
              <ChartNoAxesCombined size={20} />
              <h3>{year} learning rhythm</h3>
            </div>
            <p>Learning hours across all twelve months.</p>
            <div className="annual-bars">
              {annual.map((month) => (
                <div
                  className="annual-bar"
                  key={month.date.getMonth()}
                  title={`${format(month.date, "MMMM")}: ${hoursLabel(month.studyMinutes)} hours`}
                >
                  <span className="bar-value">
                    {hoursLabel(month.studyMinutes)}
                  </span>
                  <div className="bar-track">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{
                        height: `${(month.studyMinutes / maximum) * 100}%`,
                      }}
                      transition={{
                        duration: 0.55,
                        delay: month.date.getMonth() * 0.025,
                      }}
                    />
                  </div>
                  <small>{format(month.date, "MMM")}</small>
                </div>
              ))}
            </div>
            <div className="insight-footnote">
              {top.studyMinutes
                ? `Strongest month: ${format(top.date, "MMMM")} · ${durationLabel(top.studyMinutes)} learned`
                : "Log your first learning session to start your story."}
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-heading">
              <Target size={20} />
              <h3>Where your time goes</h3>
            </div>
            <p>Subjects based on recorded task time.</p>
            {subjectList.length ? (
              subjectList.slice(0, 8).map(([subject, minutes]) => (
                <div className="subject-row" key={subject}>
                  <span>
                    {subject}
                    <strong>{durationLabel(minutes)}</strong>
                  </span>
                  <div>
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(minutes / subjectList[0][1]) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="studio-empty">
                Save a focus session for a task with a subject to see your
                learning mix.
              </div>
            )}
            <div className="insight-footnote">
              {tasks.filter((task) => task.status === "completed").length}{" "}
              completed tasks in {year}
            </div>
          </div>
        </motion.div>
      )}
      {tab === "focus" && (
        <div className="insight-studio-grid">
          <FocusTimer
            userId={user.id}
            entries={entries}
            onSave={(day, task, minutes, session) => {
              const result = updateEntries((latest) =>
                addFocusMinutes(latest, day, task, minutes, session),
              );
              if (result.ok)
                onNotice(`${minutes} focus minutes saved to your task.`);
              return result;
            }}
          />
          <div className="feature-card goal-card">
            <div className="feature-heading">
              <Target size={20} />
              <h3>This week, with intention</h3>
            </div>
            <div
              className="goal-ring"
              style={{
                background: `conic-gradient(var(--green) ${Math.min(1, weekMinutes / goal) * 360}deg, var(--border) 0deg)`,
              }}
            >
              <div>
                <strong>{Math.round((weekMinutes / goal) * 100)}%</strong>
                <span>
                  {durationLabel(weekMinutes)} / {durationLabel(goal)}
                </span>
              </div>
            </div>
            <div className="week-dots">
              {week.map((day) => (
                <span
                  key={day.key}
                  className={day.minutes ? "done" : ""}
                  title={`${day.key}: ${durationLabel(day.minutes)}`}
                >
                  {format(parseISO(day.key), "EEEEE")}
                </span>
              ))}
            </div>
            <div className="goal-edit">
              <label htmlFor="weekly-goal">Weekly goal (hours)</label>
              <div>
                <input
                  id="weekly-goal"
                  type="number"
                  min="0.25"
                  max="63"
                  step="0.25"
                  value={goalDraft}
                  onChange={(event) => setGoalDraft(event.target.value)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={saveGoal}
                >
                  Set goal
                </button>
              </div>
            </div>
            {goalMessage && <p role="status">{goalMessage}</p>}
            <div className="streak-label">
              <Flame size={18} />
              {learningStreak(entries, now)} working-day learning streak
            </div>
          </div>
        </div>
      )}
      {tab === "backup" && (
        <BackupRestore
          entries={entries}
          updateEntries={updateEntries}
          onNotice={onNotice}
        />
      )}
      {tab === "account" && (
        <AccountSync entries={entries} updateEntries={updateEntries} />
      )}
    </section>
  );
}
