import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from "date-fns";

export const WORK_MINUTES = 540;
export const WORK_START = 9 * 60;
export const STORAGE_KEY = "daylight.activity.v1";
export const REMARK_LIMIT = 500;
export const TASK_LIMIT = 100;
export const TASK_TITLE_LIMIT = 160;
export const TASK_STATUSES = {
  todo: "To do",
  "in-progress": "In progress",
  completed: "Completed",
  blocked: "Blocked",
  "on-hold": "On hold",
} as const;
export type TaskStatus = keyof typeof TASK_STATUSES;
export type LearningTask = {
  id: string;
  title: string;
  status: TaskStatus;
  notes: string;
  minutes?: number;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  subject?: string;
  tags?: string[];
  resourceUrl?: string;
  carriedFrom?: string;
};
export type DayEntry = {
  studyMinutes: number;
  remark: string;
  holiday?: boolean;
  logged: boolean;
  tasks?: LearningTask[];
  timeMode?: "manual" | "tasks";
  updatedAt?: string;
  focusSessions?: string[];
};
export type Entries = Record<string, DayEntry>;
export type DayRecord = {
  date: Date;
  key: string;
  holiday: boolean;
  logged: boolean;
  studyMinutes: number;
  miscMinutes: number;
  remark: string;
  tasks: LearningTask[];
};
export type ActivityRow = {
  date: string;
  day: string;
  activity: string;
  start: string;
  end: string;
  hours: number;
  status: string;
  remark: string;
};

export function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}
export function isHoliday(date: Date, entry?: DayEntry) {
  return entry?.holiday ?? getDay(date) === 0;
}
export function monthDays(month: Date, entries: Entries): DayRecord[] {
  return eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  }).map((date) => {
    const key = dateKey(date),
      entry = entries[key],
      holiday = isHoliday(date, entry);
    const logged = !holiday && (entry?.logged ?? false);
    const studyMinutes = logged ? (entry?.studyMinutes ?? 0) : 0;
    return {
      date,
      key,
      holiday,
      logged,
      studyMinutes,
      miscMinutes: logged ? WORK_MINUTES - studyMinutes : 0,
      remark: entry?.remark ?? "",
      tasks: entry?.tasks ?? [],
    };
  });
}
export function monthTotals(days: DayRecord[]) {
  return days.reduce(
    (sum, day) => ({
      studyMinutes: sum.studyMinutes + day.studyMinutes,
      miscMinutes: sum.miscMinutes + day.miscMinutes,
      loggedDays: sum.loggedDays + Number(day.logged),
      workingDays: sum.workingDays + Number(!day.holiday),
      holidays: sum.holidays + Number(day.holiday),
    }),
    {
      studyMinutes: 0,
      miscMinutes: 0,
      loggedDays: 0,
      workingDays: 0,
      holidays: 0,
    },
  );
}
export function hoursLabel(minutes: number) {
  return Number((minutes / 60).toFixed(2)).toString();
}
export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return m ? `${h ? `${h}h ` : ""}${m}m` : `${h}h`;
}
export function clockLabel(minutes: number) {
  const hours = Math.floor(minutes / 60),
    mins = minutes % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
export function studyInputToMinutes(value: string) {
  if (!value.trim())
    throw new Error(
      "Enter your learning hours, including 0 if you did not study.",
    );
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 9)
    throw new Error("Learning time must be between 0 and 9 hours.");
  return Math.round(hours * 60);
}
export function activityRows(days: DayRecord[]): ActivityRow[] {
  return days.flatMap((day) => {
    const base = {
      date: format(day.date, "dd/MM/yyyy"),
      day: format(day.date, "EEEE").toUpperCase(),
      remark: day.remark,
    };
    let allocated = 0;
    const taskRows: ActivityRow[] = day.tasks.map((task) => {
      const minutes = !day.holiday && day.logged ? (task.minutes ?? 0) : 0;
      const start = WORK_START + allocated;
      allocated += minutes;
      return {
        ...base,
        activity: "Learning task",
        start: minutes ? clockLabel(start) : "",
        end: minutes ? clockLabel(start + minutes) : "",
        hours: minutes / 60,
        status: TASK_STATUSES[task.status],
        remark: `${task.title}${task.notes ? ` — ${task.notes}` : ""}${task.subject ? ` | ${task.subject}` : ""}${task.priority ? ` | ${task.priority} priority` : ""}${task.dueDate ? ` | Due ${task.dueDate}` : ""}${task.tags?.length ? ` | ${task.tags.join(", ")}` : ""}${task.resourceUrl ? ` | ${task.resourceUrl}` : ""}`,
      };
    });
    if (day.holiday || !day.logged)
      return [
        {
          ...base,
          activity: day.holiday ? "Holiday" : "Not logged",
          start: "",
          end: "",
          hours: 0,
          status: day.holiday ? "Holiday" : "Pending",
        },
        ...taskRows,
      ];
    const rows: ActivityRow[] = [];
    if (day.studyMinutes > allocated)
      rows.push({
        ...base,
        activity: "Study",
        start: clockLabel(WORK_START + allocated),
        end: clockLabel(WORK_START + day.studyMinutes),
        hours: (day.studyMinutes - allocated) / 60,
        status: day.tasks.length ? "Hours logged" : "Completed",
      });
    if (day.miscMinutes > 0)
      rows.push({
        ...base,
        activity: "Miscellaneous",
        start: clockLabel(WORK_START + day.studyMinutes),
        end: clockLabel(WORK_START + WORK_MINUTES),
        hours: day.miscMinutes / 60,
        status: day.tasks.length ? "Hours logged" : "Completed",
        remark: "Meetings, huddles and other work",
      });
    return [...taskRows, ...rows];
  });
}
export function decodeEntries(raw: string | null): Entries {
  if (raw === null) return {};
  const envelope: unknown = JSON.parse(raw);
  if (
    typeof envelope !== "object" ||
    !envelope ||
    !("version" in envelope) ||
    envelope.version !== 1 ||
    !("entries" in envelope)
  )
    throw new Error(
      "Unsupported activity data. Your existing data has been left intact.",
    );
  const data = envelope.entries;
  if (typeof data !== "object" || !data || Array.isArray(data))
    throw new Error(
      "Invalid activity data. Your existing data has been left intact.",
    );
  const entries: Entries = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
      Number.isNaN(parseISO(key).getTime()) ||
      dateKey(parseISO(key)) !== key ||
      typeof value !== "object" ||
      value === null
    )
      throw new Error("Invalid saved date.");
    const v = value as Partial<DayEntry>;
    if (
      !Number.isInteger(v.studyMinutes) ||
      v.studyMinutes! < 0 ||
      v.studyMinutes! > WORK_MINUTES ||
      typeof v.remark !== "string" ||
      v.remark.length > REMARK_LIMIT ||
      typeof v.logged !== "boolean" ||
      (v.holiday !== undefined && typeof v.holiday !== "boolean") ||
      (v.timeMode !== undefined &&
        v.timeMode !== "manual" &&
        v.timeMode !== "tasks") ||
      (v.updatedAt !== undefined &&
        (typeof v.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(v.updatedAt)))) ||
      (v.focusSessions !== undefined &&
        (!Array.isArray(v.focusSessions) ||
          v.focusSessions.length > 100 ||
          v.focusSessions.some(
            (id) => typeof id !== "string" || id.length > 100,
          )))
    )
      throw new Error(
        "Invalid saved activity. Your existing data has been left intact.",
      );
    let tasks: LearningTask[] | undefined;
    if (v.tasks !== undefined) {
      if (!Array.isArray(v.tasks) || v.tasks.length > TASK_LIMIT)
        throw new Error("Invalid saved tasks.");
      const ids = new Set<string>();
      tasks = v.tasks.map((task: unknown) => {
        if (!task || typeof task !== "object")
          throw new Error("Invalid saved task.");
        const t = task as Partial<LearningTask>;
        if (
          typeof t.id !== "string" ||
          !t.id ||
          t.id.length > 100 ||
          ids.has(t.id) ||
          typeof t.title !== "string" ||
          !t.title.trim() ||
          t.title.length > TASK_TITLE_LIMIT ||
          typeof t.notes !== "string" ||
          t.notes.length > REMARK_LIMIT ||
          typeof t.status !== "string" ||
          !Object.hasOwn(TASK_STATUSES, t.status)
        )
          throw new Error("Invalid saved task.");
        ids.add(t.id);
        if (
          (t.minutes !== undefined &&
            (!Number.isInteger(t.minutes) ||
              t.minutes < 0 ||
              t.minutes > WORK_MINUTES)) ||
          (t.priority !== undefined &&
            !["low", "medium", "high"].includes(t.priority)) ||
          (t.subject !== undefined &&
            (typeof t.subject !== "string" || t.subject.length > 80)) ||
          (t.tags !== undefined &&
            (!Array.isArray(t.tags) ||
              t.tags.length > 10 ||
              t.tags.some(
                (tag) =>
                  typeof tag !== "string" || !tag.trim() || tag.length > 40,
              ))) ||
          (t.dueDate !== undefined &&
            t.dueDate !== "" &&
            !validDateKey(t.dueDate)) ||
          (t.carriedFrom !== undefined && !validDateKey(t.carriedFrom)) ||
          (t.resourceUrl !== undefined &&
            t.resourceUrl !== "" &&
            !safeResourceUrl(t.resourceUrl))
        )
          throw new Error(
            "Invalid task time, priority, due date, tags or resource link.",
          );
        return {
          id: t.id,
          title: t.title,
          notes: t.notes,
          status: t.status,
          ...(t.minutes !== undefined ? { minutes: t.minutes } : {}),
          ...(t.priority !== undefined ? { priority: t.priority } : {}),
          ...(t.subject !== undefined ? { subject: t.subject } : {}),
          ...(t.tags !== undefined ? { tags: t.tags } : {}),
          ...(t.dueDate !== undefined ? { dueDate: t.dueDate } : {}),
          ...(t.resourceUrl !== undefined
            ? { resourceUrl: t.resourceUrl }
            : {}),
          ...(t.carriedFrom !== undefined
            ? { carriedFrom: t.carriedFrom }
            : {}),
        };
      });
    }
    const taskMinutes = (tasks ?? []).reduce(
      (sum, task) => sum + (task.minutes ?? 0),
      0,
    );
    if (
      taskMinutes > WORK_MINUTES ||
      (v.timeMode === "tasks" && taskMinutes !== v.studyMinutes) ||
      (v.logged && taskMinutes > v.studyMinutes!)
    )
      throw new Error(
        "Task time must match the daily learning allocation and stay within 9 hours.",
      );
    entries[key] = {
      studyMinutes: v.studyMinutes!,
      remark: v.remark,
      logged: v.logged,
      ...(v.holiday !== undefined ? { holiday: v.holiday } : {}),
      ...(tasks !== undefined ? { tasks } : {}),
      ...(v.timeMode !== undefined ? { timeMode: v.timeMode } : {}),
      ...(v.updatedAt !== undefined ? { updatedAt: v.updatedAt } : {}),
      ...(v.focusSessions !== undefined
        ? { focusSessions: v.focusSessions }
        : {}),
    };
  }
  return entries;
}
export function encodeEntries(entries: Entries) {
  return JSON.stringify({ version: 1, entries });
}
export function validDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parseISO(value).getTime()) &&
    dateKey(parseISO(value)) === value
  );
}
export function safeResourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
