import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  parseISO,
  startOfWeek,
} from "date-fns";
import {
  dateKey,
  decodeEntries,
  encodeEntries,
  isHoliday,
  TASK_LIMIT,
  WORK_MINUTES,
  type Entries,
  type LearningTask,
} from "./activity";

export function taskMinutes(tasks: LearningTask[]) {
  return tasks.reduce((sum, task) => sum + (task.minutes ?? 0), 0);
}

export function carryTasks(
  entries: Entries,
  source: string,
  destination: string,
  ids: string[],
) {
  const selected =
    entries[source]?.tasks?.filter(
      (task) => ids.includes(task.id) && task.status !== "completed",
    ) ?? [];
  if (source === destination || !selected.length)
    throw new Error(
      "Choose unfinished tasks and a different destination date.",
    );
  decodeEntries(
    encodeEntries({
      [destination]: { studyMinutes: 0, remark: "", logged: false },
    }),
  );
  const target = entries[destination] ?? {
    studyMinutes: 0,
    remark: "",
    logged: false,
    timeMode: "manual" as const,
  };
  const existing = target.tasks ?? [];
  const copies = selected
    .filter(
      (task) =>
        !existing.some(
          (old) => old.id === `${source}:${stableTaskId(task.id)}`,
        ),
    )
    .map((task) => ({
      ...task,
      id: `${source}:${stableTaskId(task.id)}`,
      minutes: 0,
      carriedFrom: source,
    }));
  if (!copies.length)
    throw new Error("These tasks have already been carried to this date.");
  if (existing.length + copies.length > TASK_LIMIT)
    throw new Error("The destination day would exceed 100 tasks.");
  // Copying keeps past learning history intact and never duplicates logged time.
  const entry = {
    ...target,
    tasks: [...existing, ...copies],
    updatedAt: new Date().toISOString(),
  };
  return decodeEntries(encodeEntries({ ...entries, [destination]: entry }));
}
function stableTaskId(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${(hash >>> 0).toString(16)}-${id.slice(-60)}`;
}

export function addFocusMinutes(
  entries: Entries,
  day: string,
  taskId: string,
  minutes: number,
  sessionId?: string,
) {
  if (!Number.isInteger(minutes) || minutes <= 0)
    throw new Error("Focus for at least one full minute before saving.");
  const entry = entries[day];
  if (sessionId && entry?.focusSessions?.includes(sessionId)) return entries;
  if (!entry || !entry.tasks?.some((task) => task.id === taskId))
    throw new Error("This task is no longer available. Choose another task.");
  if (isHoliday(parseISO(day), entry))
    throw new Error(
      "Change this day to a working day before saving focus time.",
    );
  const tasks = entry.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          minutes: (task.minutes ?? 0) + minutes,
          status:
            task.status === "todo" ? ("in-progress" as const) : task.status,
        }
      : task,
  );
  const studyMinutes =
    entry.timeMode === "tasks"
      ? taskMinutes(tasks)
      : (entry.logged
          ? entry.studyMinutes
          : Math.max(entry.studyMinutes, taskMinutes(entry.tasks))) + minutes;
  if (studyMinutes > WORK_MINUTES)
    throw new Error(
      "This session would take daily learning time over 9 hours. Your timer has been kept; choose a day with remaining learning time.",
    );
  return decodeEntries(
    encodeEntries({
      ...entries,
      [day]: {
        ...entry,
        tasks,
        studyMinutes,
        logged: true,
        updatedAt: new Date().toISOString(),
        ...(sessionId
          ? {
              focusSessions: [...(entry.focusSessions ?? []), sessionId].slice(
                -100,
              ),
            }
          : {}),
      },
    }),
  );
}

export function mergeEntries(
  existing: Entries,
  incoming: Entries,
  prefer: "existing" | "incoming" = "existing",
) {
  return decodeEntries(
    encodeEntries(
      prefer === "existing"
        ? { ...incoming, ...existing }
        : { ...existing, ...incoming },
    ),
  );
}
export function weekLearning(entries: Entries, date: Date) {
  return eachDayOfInterval({
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  }).map((day) => {
    const entry = entries[dateKey(day)];
    return {
      key: dateKey(day),
      minutes: entry?.logged && !isHoliday(day, entry) ? entry.studyMinutes : 0,
    };
  });
}
export function learningStreak(entries: Entries, today: Date) {
  let count = 0;
  let cursor = today;
  const entry = entries[dateKey(cursor)];
  if (!entry?.logged || isHoliday(cursor, entry) || !entry.studyMinutes)
    cursor = addDays(cursor, -1);
  for (let i = 0; i < 3660; i++) {
    const item = entries[dateKey(cursor)];
    if (isHoliday(cursor, item)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!item?.logged || !item.studyMinutes) break;
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
export function elapsedSeconds(
  timer: { seconds: number; startedAt: number | null },
  now: number,
) {
  return (
    timer.seconds +
    (timer.startedAt === null
      ? 0
      : Math.max(0, Math.floor((now - timer.startedAt) / 1000)))
  );
}
