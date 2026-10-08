"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  LogOut,
  Plus,
  Sparkles,
  Sun,
  Umbrella,
  X,
} from "lucide-react";
import {
  dateKey,
  decodeEntries,
  durationLabel,
  encodeEntries,
  hoursLabel,
  isHoliday,
  monthDays,
  monthTotals,
  WORK_MINUTES,
  TASK_STATUSES,
  type DayEntry,
} from "@/lib/activity";
import { downloadExcel, downloadPdf, downloadText } from "@/lib/exports";
import { useActivity } from "@/hooks/use-activity";
import { useGoogleSync } from "@/hooks/use-google-sync";
import GoogleSyncPanel from "./google-sync-panel";
import DailyQuoteArea from "./daily-quote";
import DayModal from "./day-modal";
import LearningStudio from "./learning-studio";
import BrandIcon, { BrandMotion } from "./brand-icon";
import ColourPreferences from "./colour-preferences";
import {
  readTheme,
  THEME_OPTIONS,
  type ThemePreference,
} from "@/lib/ui-preferences";
import { useWorkspace } from "./workspace-auth";
import { workspaceKeys } from "@/lib/workspace-storage";
import { carryTasks } from "@/lib/learning";

export default function CalendarApp() {
  const { user, signOut } = useWorkspace();
  const displayName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name.trim().slice(0, 80) || "Your workspace"
      : "Your workspace";
  const [signingOut, setSigningOut] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState<Date | null>(null);
  const [view, setView] = useState<"calendar" | "report">("calendar");
  const [screen, setScreen] = useState<"year" | "month">("year");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [taskStatus, setTaskStatus] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const { entries, ready, storageWarning, saveDay, updateEntries } =
    useActivity(user.id);
  const googleSync = useGoogleSync(user.id, entries, ready && !storageWarning);
  useEffect(() => {
    if (ready) pageTitle.current?.focus({ preventScroll: true });
  }, [ready, screen, month, view]);
  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const value = params.get("month");
      if (value && /^\d{4}-\d{2}$/.test(value)) {
        const date = parseISO(`${value}-01`);
        if (!Number.isNaN(date.getTime())) {
          setMonth(date);
          setScreen("month");
          setView(params.get("view") === "report" ? "report" : "calendar");
          setSearch("");
          setStatus("all");
          setTaskStatus("all");
          setSubjectFilter("all");
          return;
        }
      }
      const selectedYear = params.get("year");
      if (
        selectedYear &&
        /^\d{4}$/.test(selectedYear) &&
        Number(selectedYear) >= 1900 &&
        Number(selectedYear) <= 9998
      )
        setMonth(
          (previous) => new Date(Number(selectedYear), previous.getMonth(), 1),
        );
      setScreen("year");
    }
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);
  useEffect(() => {
    setToday(dateKey(new Date()));
    setTheme(readTheme(document.documentElement.dataset.theme));
    const timer = setInterval(() => setToday(dateKey(new Date())), 60000);
    return () => {
      clearInterval(timer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  const days = useMemo(() => monthDays(month, entries), [month, entries]);
  const totals = useMemo(() => monthTotals(days), [days]);
  const year = month.getFullYear();
  const yearMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const date = new Date(year, index, 1);
        return { date, totals: monthTotals(monthDays(date, entries)) };
      }),
    [year, entries],
  );
  const annualTotals = useMemo(
    () =>
      monthTotals(yearMonths.flatMap(({ date }) => monthDays(date, entries))),
    [yearMonths, entries],
  );
  const cellDates = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );
  const learningRatio = totals.loggedDays
    ? (totals.studyMinutes / (totals.loggedDays * WORK_MINUTES)) * 100
    : 0;
  const logProgress = totals.workingDays
    ? (totals.loggedDays / totals.workingDays) * 100
    : 0;
  const recent = days
    .filter((day) => day.logged)
    .slice(-3)
    .reverse();
  function notify(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }
  const nextPending = days.find(
    (day) => !day.holiday && !day.logged && day.key <= today,
  );
  const monthTasks = days.flatMap((day) => day.tasks);
  const completedTasks = monthTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const reportDays = days.filter((day) => {
    const dayStatus = day.holiday
      ? "holiday"
      : day.logged
        ? "completed"
        : "pending";
    const text =
      `${format(day.date, "dd MMMM yyyy EEEE")} ${day.remark} ${day.tasks.map((task) => `${task.title} ${task.notes} ${task.subject ?? ""} ${task.tags?.join(" ") ?? ""} ${task.priority ?? ""} ${TASK_STATUSES[task.status]}`).join(" ")}`.toLowerCase();
    return (
      (status === "all" || status === dayStatus) &&
      (taskStatus === "all" ||
        day.tasks.some((task) => task.status === taskStatus)) &&
      (subjectFilter === "all" ||
        day.tasks.some((task) => task.subject === subjectFilter)) &&
      text.includes(search.toLowerCase().trim())
    );
  });
  function navigateMonth(
    date: Date,
    nextView: "calendar" | "report" = "calendar",
  ) {
    setMonth(startOfMonth(date));
    setScreen("month");
    setView(nextView);
    setSearch("");
    setStatus("all");
    setTaskStatus("all");
    setSubjectFilter("all");
    window.location.hash = `month=${format(date, "yyyy-MM")}&view=${nextView}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function navigateYear(nextYear = year) {
    if (nextYear < 1900 || nextYear > 9998) return;
    setMonth(new Date(nextYear, month.getMonth(), 1));
    setScreen("year");
    window.location.hash = `year=${nextYear}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function switchTheme(next: ThemePreference) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("daylight.theme", next);
    } catch {
      notify("Theme changed for this session.");
    }
  }
  function openDate(date: Date) {
    if (!ready) return;
    if (screen === "year" || !isSameMonth(date, month)) navigateMonth(date);
    setSelected(date);
  }
  function toggleHoliday(date: Date) {
    const key = dateKey(date),
      old = entries[key];
    const next: DayEntry = {
      ...old,
      studyMinutes: old?.studyMinutes ?? 0,
      remark: old?.remark ?? "",
      logged: old?.logged ?? false,
      holiday: !isHoliday(date, old),
      tasks: old?.tasks ?? [],
    };
    const result = saveDay(key, next);
    notify(
      result.ok
        ? next.holiday
          ? "Marked as a holiday. Enjoy the pause."
          : "Marked as a working day."
        : result.message,
    );
  }
  async function exportMonth(
    type: "pdf" | "excel",
    scope: "month" | "year" = "month",
  ) {
    setExporting(type);
    try {
      const exportDays =
        scope === "year"
          ? yearMonths.flatMap(({ date }) => monthDays(date, entries))
          : days;
      await (type === "pdf"
        ? downloadPdf(month, exportDays, scope)
        : downloadExcel(month, exportDays, scope));
      notify(`${type === "pdf" ? "PDF" : "Excel"} report downloaded.`);
    } catch (e) {
      console.error("Export failed", e);
      notify("The report could not be generated. Please try again.");
    } finally {
      setExporting(null);
    }
  }
  function backup() {
    let text = encodeEntries(entries);
    try {
      const raw = localStorage.getItem(workspaceKeys(user.id).activity);
      if (raw) {
        try {
          decodeEntries(raw);
        } catch {
          text = raw;
        }
      }
    } catch {
      /* use current session data */
    }
    downloadText(`DAILY_ACTIVITY_BACKUP_${dateKey(new Date())}.json`, text);
    notify("Activity backup downloaded.");
  }
  if (!ready)
    return (
      <div className="loading-shell" role="status">
        <BrandIcon size={38} animated />
        <strong>daylight.</strong>
        <span>Getting your calendar ready…</span>
      </div>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" href="/" aria-label="Daylight home">
            <span className="brand-symbol">
              <BrandIcon size={23} />
            </span>
            <span>
              daylight<span className="brand-period">.</span>
            </span>
          </Link>
          <div className="workspace-label">YOUR PERSONAL WORKSPACE</div>
          <div className="workspace-owner" title={user.email}>
            <strong>{displayName}</strong>
            <span>{user.email}</span>
          </div>
          <nav aria-label="Main navigation">
            <button
              className={`nav-item ${screen === "year" ? "active" : ""}`}
              onClick={() => navigateYear()}
            >
              <CalendarDays size={19} />
              All months
              <span className="nav-dot" />
            </button>
            <button
              className={`nav-item ${screen === "month" && view === "report" ? "active" : ""}`}
              onClick={() => navigateMonth(month, "report")}
            >
              <ChartNoAxesCombined size={19} />
              Monthly report
              <ArrowUpRight size={15} />
            </button>
          </nav>
          {today && <DailyQuoteArea date={today} variant="sidebar" />}
          <div className="sidebar-bottom">
            <div className="workday">
              <Clock3 size={18} />
              <div>
                <strong>Your working day</strong>
                <span>9:00 AM – 6:00 PM</span>
              </div>
            </div>
            <div className="profile">
              <span className="avatar">
                {displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div>
                <strong>{displayName}</strong>
                <span>Always learning</span>
              </div>
              <BrandIcon size={16} />
            </div>
          </div>
        </aside>
        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              <span className="mobile-brand">
                <BrandIcon size={19} />
                daylight.
              </span>
              <span className="desktop-breadcrumb">
                Workspace <ChevronRight size={13} />
              </span>
              <strong>
                {screen === "year"
                  ? "All months"
                  : `${format(month, "MMMM yyyy")} / ${view === "calendar" ? "Daily log" : "Report"}`}
              </strong>
            </div>
            <div className="topbar-actions">
              <button
                className="secondary-button topbar-backup"
                type="button"
                disabled={!ready}
                onClick={backup}
                aria-label="Download a JSON backup of all your saved activity"
                title="Download your saved days, tasks and notes as a restorable JSON backup"
              >
                <ArrowDownToLine size={17} aria-hidden="true" />
                <span>Backup</span>
              </button>
              <button
                className="icon-button"
                type="button"
                title={`Sign out ${user.email ?? "of your account"}`}
                aria-label="Sign out of your workspace"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await signOut();
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? error.message
                        : "Unable to sign out.",
                    );
                    setSigningOut(false);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
              <ColourPreferences onNotice={notify} />
              <span className="local-badge">
                <i />
                {storageWarning
                  ? "Storage needs attention"
                  : "Saved on this device"}
              </span>
              <label className="sr-only" htmlFor="workspace-theme">
                UI theme
              </label>
              <select
                id="workspace-theme"
                className="theme-select"
                value={theme}
                onChange={(event) => switchTheme(readTheme(event.target.value))}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </header>
          <section className="page-content">
            <div className="intro">
              <div>
                <span className="eyebrow">
                  <span className="tiny-line" /> A LITTLE MORE INTENTIONAL
                </span>
                <h1 ref={pageTitle} tabIndex={-1}>
                  {screen === "year" ? (
                    <>
                      Your year, <em>one month at a time.</em>
                    </>
                  ) : view === "calendar" ? (
                    <>
                      Make time for
                      <br className="mobile-break" /> what matters<span>.</span>
                    </>
                  ) : (
                    <>
                      Your month, <em>in perspective.</em>
                    </>
                  )}
                </h1>
                <p>
                  {screen === "year"
                    ? "Choose a month. Capture your learning. See your progress grow."
                    : view === "calendar"
                      ? "Track your learning. Find your balance. Watch yourself grow."
                      : "Every hour is a step forward. Here’s where yours went."}
                </p>
              </div>
              <BrandMotion />
              <button
                className="primary-button log-today"
                disabled={!ready}
                onClick={() => openDate(new Date())}
              >
                <Plus size={18} />
                Log today
              </button>
            </div>
            {storageWarning && (
              <div className="storage-warning" role="alert">
                {storageWarning}
                <button onClick={backup}>Download backup</button>
              </div>
            )}
            {screen === "year" ? (
              <section
                className="year-overview"
                aria-label={`${year} year overview`}
              >
                <div className="year-heading">
                  <div>
                    <h2>{year} year overview</h2>
                    <p>Choose any month to view and log your daily activity.</p>
                  </div>
                  <div className="month-controls">
                    <button
                      className="secondary-button"
                      disabled={exporting !== null}
                      onClick={() => exportMonth("excel", "year")}
                    >
                      <FileSpreadsheet size={15} />
                      Year Excel
                    </button>
                    <button
                      className="secondary-button"
                      disabled={exporting !== null}
                      onClick={() => exportMonth("pdf", "year")}
                    >
                      <ArrowDownToLine size={15} />
                      Year PDF
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Previous year"
                      onClick={() => navigateYear(year - 1)}
                    >
                      <ChevronLeft size={19} />
                    </button>
                    <button
                      className="today-button"
                      onClick={() => navigateYear(new Date().getFullYear())}
                    >
                      Current year
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Next year"
                      onClick={() => navigateYear(year + 1)}
                    >
                      <ChevronRight size={19} />
                    </button>
                  </div>
                </div>
                <div className="annual-summary">
                  <span>
                    <strong>{hoursLabel(annualTotals.studyMinutes)} hrs</strong>{" "}
                    learning this year
                  </span>
                  <span>
                    <strong>{hoursLabel(annualTotals.miscMinutes)} hrs</strong>{" "}
                    miscellaneous this year
                  </span>
                  <span>
                    <strong>
                      {annualTotals.loggedDays} / {annualTotals.workingDays}
                    </strong>{" "}
                    working days logged
                  </span>
                </div>
                <div className="year-month-grid">
                  {yearMonths.map(({ date, totals: monthSummary }) => (
                    <motion.button
                      key={date.getMonth()}
                      data-month={format(date, "MM")}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.35,
                        delay: date.getMonth() * 0.025,
                      }}
                      whileHover={{ y: -5, rotateX: 3, rotateY: -3 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ transformPerspective: 800 }}
                      className={`year-month ${format(date, "yyyy-MM") === today.slice(0, 7) ? "selected" : ""}`}
                      aria-label={`Open ${format(date, "MMMM yyyy")}, ${monthSummary.loggedDays} days logged`}
                      onClick={() => navigateMonth(date)}
                    >
                      <strong>
                        {format(date, "MMMM")} <ArrowUpRight size={17} />
                      </strong>
                      {format(date, "yyyy-MM") === today.slice(0, 7) && (
                        <span className="month-badge">Current month</span>
                      )}
                      <span>
                        {hoursLabel(monthSummary.studyMinutes)} hrs learning
                      </span>
                      <small>
                        {monthSummary.loggedDays} / {monthSummary.workingDays}{" "}
                        days logged
                      </small>
                      <span className="month-progress" aria-hidden="true">
                        <span
                          style={{
                            width: `${monthSummary.workingDays ? (monthSummary.loggedDays / monthSummary.workingDays) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>
                        Open daily log <ChevronRight size={12} />
                      </small>
                    </motion.button>
                  ))}
                </div>
              </section>
            ) : (
              <>
                <div className="log-shortcuts">
                  <button
                    className="secondary-button"
                    onClick={() => navigateYear()}
                  >
                    <ChevronLeft size={16} />
                    All months
                  </button>
                  <div className="log-view-tabs" aria-label="Month view">
                    <button
                      className={view === "calendar" ? "active" : ""}
                      aria-pressed={view === "calendar"}
                      onClick={() => navigateMonth(month)}
                    >
                      Daily calendar
                    </button>
                    <button
                      className={view === "report" ? "active" : ""}
                      aria-pressed={view === "report"}
                      onClick={() => navigateMonth(month, "report")}
                    >
                      Activity list
                    </button>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!nextPending}
                    title={
                      nextPending
                        ? `Log ${format(nextPending.date, "d MMMM")}`
                        : "No pending working days up to today in this month"
                    }
                    onClick={() => nextPending && openDate(nextPending.date)}
                  >
                    {nextPending
                      ? "Log next pending day"
                      : "No pending days up to today"}{" "}
                    <Plus size={16} />
                  </button>
                  <label className="jump-date">
                    Jump to date
                    <input
                      type="date"
                      value=""
                      onChange={(event) => {
                        const date = parseISO(event.target.value);
                        if (!Number.isNaN(date.getTime())) openDate(date);
                      }}
                    />
                  </label>
                </div>
                <section
                  className="month-task-summary"
                  aria-label="Monthly learning tasks"
                >
                  <div>
                    <span className="eyebrow">LEARNING IN MOTION</span>
                    <h2>
                      {monthTasks.length
                        ? `${completedTasks} of ${monthTasks.length} tasks completed`
                        : "Make room for your next idea"}
                    </h2>
                    <p>
                      {monthTasks.length
                        ? "Every task has its own pace. Keep track of what comes next."
                        : "Open a day and add the topics, exercises or skills you want to work on."}
                    </p>
                  </div>
                  <div className="task-summary-badges">
                    {Object.entries(TASK_STATUSES).map(([value, label]) => (
                      <span
                        className={`task-status-badge status-${value}`}
                        key={value}
                      >
                        {label}{" "}
                        <strong>
                          {
                            monthTasks.filter((task) => task.status === value)
                              .length
                          }
                        </strong>
                      </span>
                    ))}
                  </div>
                </section>
                <div className="stats-grid">
                  <motion.div
                    className="stat-card learning-card"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                  >
                    <div className="stat-top">
                      <span>Learning hours</span>
                      <span className="stat-icon">
                        <BookOpen size={19} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {hoursLabel(totals.studyMinutes)}
                      <span>hrs</span>
                      <span className="stat-spark">
                        <Sparkles size={21} />
                      </span>
                    </div>
                    <p>
                      <i className="dot study" />
                      Time invested in yourself
                    </p>
                  </motion.div>
                  <motion.div
                    className="stat-card"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.05 }}
                  >
                    <div className="stat-top">
                      <span>Miscellaneous hours</span>
                      <span className="stat-icon neutral">
                        <Clock3 size={19} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {hoursLabel(totals.miscMinutes)}
                      <span>hrs</span>
                    </div>
                    <p>
                      <i className="dot misc" />
                      Meetings, huddles & everything else
                    </p>
                  </motion.div>
                  <motion.div
                    className="stat-card"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="stat-top">
                      <span>Days logged</span>
                      <span className="stat-icon neutral">
                        <CalendarDays size={19} />
                      </span>
                    </div>
                    <div className="stat-value">
                      {totals.loggedDays}
                      <span>/ {totals.workingDays} working days</span>
                    </div>
                    <div className="small-progress">
                      <motion.div animate={{ width: `${logProgress}%` }} />
                    </div>
                    <p>
                      {totals.holidays} holidays ·{" "}
                      {totals.workingDays - totals.loggedDays} days left to log
                    </p>
                  </motion.div>
                </div>
                <div
                  className={`workspace-grid ${view === "report" ? "report-layout" : ""}`}
                >
                  <section
                    className="calendar-panel"
                    aria-label={`${format(month, "MMMM yyyy")} ${view}`}
                  >
                    <div className="calendar-toolbar">
                      <div>
                        <h2>
                          {format(month, "MMMM")}{" "}
                          <span>{format(month, "yyyy")}</span>
                        </h2>
                        <p>
                          {view === "calendar"
                            ? "A fresh chance to make every day count."
                            : "Your activity breakdown, day by day."}
                        </p>
                      </div>
                      <div className="month-controls">
                        <button
                          className="today-button"
                          onClick={() => navigateMonth(new Date(), view)}
                        >
                          Today
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Previous month"
                          onClick={() =>
                            navigateMonth(addMonths(month, -1), view)
                          }
                        >
                          <ChevronLeft size={19} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Next month"
                          onClick={() =>
                            navigateMonth(addMonths(month, 1), view)
                          }
                        >
                          <ChevronRight size={19} />
                        </button>
                      </div>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={`${format(month, "yyyy-MM")}-${view}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                      >
                        {view === "calendar" ? (
                          <>
                            <div className="weekdays">
                              {[
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                                "Sun",
                              ].map((day) => (
                                <span key={day}>{day}</span>
                              ))}
                            </div>
                            <div className="calendar-grid">
                              {cellDates.map((date) => {
                                const key = dateKey(date),
                                  current = isSameMonth(date, month),
                                  entry = entries[key],
                                  holiday = isHoliday(date, entry),
                                  logged = !holiday && entry?.logged,
                                  dayToday = key === today;
                                return (
                                  <motion.div
                                    key={key}
                                    className={`day-cell ${!current ? "other-month" : ""} ${holiday ? "holiday" : ""} ${logged ? "logged" : ""} ${dayToday ? "is-today" : ""}`}
                                    whileHover={current ? { y: -2 } : undefined}
                                  >
                                    <button
                                      className="day-open"
                                      disabled={!ready}
                                      aria-label={`Edit ${format(date, "MMMM d, yyyy")}${holiday ? ", holiday" : logged ? `, ${durationLabel(entry.studyMinutes)} learning` : ", not logged"}`}
                                      onClick={() => openDate(date)}
                                    >
                                      <span className="date-number">
                                        {format(date, "d")}
                                        {dayToday && (
                                          <span className="today-dot" />
                                        )}
                                      </span>
                                      <span className="day-content">
                                        {holiday ? (
                                          <>
                                            <span className="holiday-label">
                                              <Sun size={13} />
                                              <span>Holiday</span>
                                            </span>
                                            <span className="day-subtitle">
                                              Time to recharge
                                            </span>
                                          </>
                                        ) : logged ? (
                                          <>
                                            <strong className="day-hours">
                                              {durationLabel(
                                                entry.studyMinutes,
                                              )}{" "}
                                              <span>learning</span>
                                            </strong>
                                            <span className="day-subtitle">
                                              {durationLabel(
                                                WORK_MINUTES -
                                                  entry.studyMinutes,
                                              )}{" "}
                                              misc.
                                            </span>
                                            <span className="day-progress">
                                              <motion.span
                                                animate={{
                                                  width: `${(entry.studyMinutes / WORK_MINUTES) * 100}%`,
                                                }}
                                              />
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <span className="empty-label">
                                              <Plus size={12} />
                                              <span>Log your day</span>
                                            </span>
                                            <span className="empty-mark" />
                                          </>
                                        )}
                                      </span>
                                      {!!entry?.tasks?.length && (
                                        <span className="day-task-count">
                                          <Check size={11} />{" "}
                                          {
                                            entry.tasks.filter(
                                              (task) =>
                                                task.status === "completed",
                                            ).length
                                          }
                                          /{entry.tasks.length} tasks
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      className="holiday-toggle"
                                      disabled={!ready}
                                      aria-pressed={holiday}
                                      aria-label={`Mark ${format(date, "MMMM d, yyyy")} as ${holiday ? "working day" : "holiday"}`}
                                      title={
                                        holiday
                                          ? "Mark as working day"
                                          : "Mark as holiday"
                                      }
                                      onClick={() => toggleHoliday(date)}
                                    >
                                      {holiday ? (
                                        <Sun size={13} />
                                      ) : (
                                        <Umbrella size={13} />
                                      )}
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="report-filters">
                              <label>
                                Search activity
                                <input
                                  type="search"
                                  placeholder="Find a task, note or date..."
                                  value={search}
                                  onChange={(event) =>
                                    setSearch(event.target.value)
                                  }
                                />
                              </label>
                              <label>
                                Day status
                                <select
                                  value={status}
                                  onChange={(event) =>
                                    setStatus(event.target.value)
                                  }
                                >
                                  <option value="all">All days</option>
                                  <option value="completed">
                                    Hours logged
                                  </option>
                                  <option value="pending">Pending</option>
                                  <option value="holiday">Holidays</option>
                                </select>
                              </label>
                              <label>
                                Task status
                                <select
                                  value={taskStatus}
                                  onChange={(event) =>
                                    setTaskStatus(event.target.value)
                                  }
                                >
                                  <option value="all">All tasks</option>
                                  {Object.entries(TASK_STATUSES).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                              <span role="status">
                                <label
                                  className="sr-only"
                                  htmlFor="subject-filter"
                                >
                                  Subject
                                </label>
                                <select
                                  id="subject-filter"
                                  value={subjectFilter}
                                  onChange={(event) =>
                                    setSubjectFilter(event.target.value)
                                  }
                                >
                                  <option value="all">All subjects</option>
                                  {[
                                    ...new Set(
                                      monthTasks
                                        .map((task) => task.subject)
                                        .filter(
                                          (subject): subject is string =>
                                            !!subject,
                                        ),
                                    ),
                                  ].map((subject) => (
                                    <option value={subject} key={subject}>
                                      {subject}
                                    </option>
                                  ))}
                                </select>
                                {reportDays.length} days shown
                              </span>
                            </div>
                            <div className="report-scroll">
                              <table className="report-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Status</th>
                                    <th>Learning</th>
                                    <th>Misc.</th>
                                    <th>Tasks & notes</th>
                                    <th>
                                      <span className="sr-only">Edit</span>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {!reportDays.length && (
                                    <tr>
                                      <td colSpan={6}>
                                        No days match your search. Try another
                                        note, date or status.
                                      </td>
                                    </tr>
                                  )}
                                  {reportDays.map((day) => (
                                    <tr key={day.key}>
                                      <td>
                                        <strong>
                                          {format(day.date, "dd MMM")}
                                        </strong>
                                        <small>
                                          {format(day.date, "EEEE")}
                                        </small>
                                      </td>
                                      <td>
                                        <span
                                          className={`status-pill ${day.holiday ? "holiday" : day.logged ? "done" : "pending"}`}
                                        >
                                          {day.holiday
                                            ? "Holiday"
                                            : day.logged
                                              ? "Hours logged"
                                              : "Pending"}
                                        </span>
                                      </td>
                                      <td>{durationLabel(day.studyMinutes)}</td>
                                      <td>{durationLabel(day.miscMinutes)}</td>
                                      <td className="remark-cell">
                                        {!!day.tasks.length && (
                                          <ul className="report-task-list">
                                            {day.tasks.map((task) => (
                                              <li key={task.id}>
                                                <strong>{task.title}</strong>
                                                <span
                                                  className={`task-status-badge status-${task.status}`}
                                                >
                                                  {TASK_STATUSES[task.status]}
                                                </span>
                                                {task.notes && (
                                                  <p>{task.notes}</p>
                                                )}
                                                <div className="task-detail-chips">
                                                  <span>
                                                    {durationLabel(
                                                      task.minutes ?? 0,
                                                    )}
                                                  </span>
                                                  {task.subject && (
                                                    <span>{task.subject}</span>
                                                  )}
                                                  {task.tags?.map((tag) => (
                                                    <span key={tag}>
                                                      #{tag}
                                                    </span>
                                                  ))}
                                                  {task.resourceUrl && (
                                                    <a
                                                      href={task.resourceUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                    >
                                                      Resource ↗
                                                    </a>
                                                  )}
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                        {day.remark || "—"}
                                      </td>
                                      <td>
                                        <button
                                          className="icon-button"
                                          aria-label={`Edit ${format(day.date, "MMMM d, yyyy")}`}
                                          disabled={!ready}
                                          onClick={() => openDate(day.date)}
                                        >
                                          <ArrowUpRight size={16} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <th>Full month totals</th>
                                    <td>{totals.loggedDays} logged</td>
                                    <td>
                                      {durationLabel(totals.studyMinutes)}
                                    </td>
                                    <td>{durationLabel(totals.miscMinutes)}</td>
                                    <td colSpan={2}>
                                      Only logged working days count.
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                    <div className="calendar-footer">
                      <div className="legend">
                        <span>
                          <i className="dot study" />
                          Learning
                        </span>
                        <span>
                          <i className="dot misc" />
                          Miscellaneous
                        </span>
                        <span>
                          <i className="dot holiday" />
                          Holiday
                        </span>
                      </div>
                      <span className="calendar-hint">
                        {view === "calendar"
                          ? "Click a day to add your hours"
                          : "Click the arrow to edit a day"}
                        <ArrowUpRight size={13} />
                      </span>
                    </div>
                  </section>
                  <aside className="insights">
                    <div className="balance-card">
                      <div className="section-label">
                        YOUR MONTHLY BALANCE <ArrowUpRight size={15} />
                      </div>
                      <div className="balance-ring">
                        <svg viewBox="0 0 160 160" aria-hidden="true">
                          <circle
                            cx="80"
                            cy="80"
                            r="64"
                            className="ring-track"
                          />
                          <motion.circle
                            cx="80"
                            cy="80"
                            r="64"
                            className="ring-fill"
                            strokeDasharray={2 * Math.PI * 64}
                            animate={{
                              strokeDashoffset:
                                2 * Math.PI * 64 * (1 - learningRatio / 100),
                            }}
                            transition={{ duration: 0.8 }}
                          />
                        </svg>
                        <div>
                          <strong>
                            {Math.round(learningRatio)}
                            <span>%</span>
                          </strong>
                          <small>spent learning</small>
                        </div>
                      </div>
                      <div className="balance-legend">
                        <span>
                          <i className="dot study" />
                          Learning
                          <strong>{durationLabel(totals.studyMinutes)}</strong>
                        </span>
                        <span>
                          <i className="dot misc" />
                          Miscellaneous
                          <strong>{durationLabel(totals.miscMinutes)}</strong>
                        </span>
                      </div>
                      <p>
                        {totals.loggedDays
                          ? "Every hour of learning is a little investment in your future."
                          : "Your next chapter starts with one logged day."}
                      </p>
                    </div>
                    <div className="recent-card">
                      <div className="section-label">
                        RECENTLY LOGGED <BookOpen size={15} />
                      </div>
                      {recent.length ? (
                        recent.map((day) => (
                          <button
                            className="recent-entry"
                            key={day.key}
                            onClick={() => openDate(day.date)}
                          >
                            <span className="recent-date">
                              <strong>{format(day.date, "dd")}</strong>
                              <small>{format(day.date, "MMM")}</small>
                            </span>
                            <span className="recent-copy">
                              <strong>
                                {day.remark || "A day of progress"}
                              </strong>
                              <small>
                                {durationLabel(day.studyMinutes)} of learning
                              </small>
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))
                      ) : (
                        <div className="recent-empty">
                          <span>
                            <BookOpen size={21} />
                          </span>
                          <p>
                            A clean page.
                            <br />
                            Make your first entry.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="tip-card">
                      <BrandIcon size={19} />
                      <p>
                        Progress isn’t always a leap.
                        <br />
                        <strong>Sometimes it’s just showing up.</strong>
                      </p>
                    </div>
                  </aside>
                </div>
                <section className="export-bar">
                  <div className="export-copy">
                    <span className="export-icon">
                      <FileSpreadsheet size={22} />
                    </span>
                    <div>
                      <h3>Your progress, ready to share.</h3>
                      <p>
                        Download your {format(month, "MMMM")} activity report.
                      </p>
                    </div>
                  </div>
                  <div className="export-actions">
                    <button
                      className="secondary-button"
                      disabled={!ready || exporting !== null}
                      onClick={() => exportMonth("pdf")}
                    >
                      <ArrowDownToLine size={16} />
                      {exporting === "pdf" ? "Generating…" : "Download PDF"}
                    </button>
                    <button
                      className="primary-button excel-button"
                      disabled={!ready || exporting !== null}
                      onClick={() => exportMonth("excel")}
                    >
                      <FileSpreadsheet size={16} />
                      {exporting === "excel" ? "Generating…" : "Download Excel"}
                    </button>
                  </div>
                </section>
              </>
            )}
            <GoogleSyncPanel sync={googleSync} />
            <LearningStudio
              entries={entries}
              year={year}
              updateEntries={updateEntries}
              onNotice={notify}
            />
            <footer className="page-footer">
              <span>Built for a little progress, every day.</span>
              <button
                className="backup-button"
                disabled={!ready}
                onClick={backup}
              >
                <ArrowDownToLine size={12} />
                Back up all data
              </button>
              <span>
                <BrandIcon size={12} />
                {googleSync.status?.connected
                  ? "Device storage with your Google copy"
                  : "Your data stays on your device"}
              </span>
            </footer>
          </section>
        </main>
        <AnimatePresence>
          {selected && (
            <DayModal
              key={dateKey(selected)}
              date={selected}
              entry={entries[dateKey(selected)]}
              onSave={saveDay}
              onCarry={(source, target, ids, expected) => {
                const result = updateEntries((latest) => {
                  if (JSON.stringify(latest[source] ?? null) !== expected)
                    throw new Error(
                      "The source day changed. Reopen it before carrying tasks.",
                    );
                  return carryTasks(latest, source, target, ids);
                });
                return result.ok
                  ? {
                      ...result,
                      message:
                        "Unfinished tasks copied without duplicating your hours.",
                    }
                  : result;
              }}
              onClose={() => setSelected(null)}
              onNotice={notify}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {notice && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <Check size={17} />
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
