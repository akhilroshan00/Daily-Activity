import { parseISO } from "date-fns";
import {
  activityRows,
  decodeEntries,
  encodeEntries,
  isHoliday,
  TASK_STATUSES,
  type DayRecord,
  type Entries,
} from "./activity";
import { dayTimeTotals, effectiveTimeLog } from "./time-log";

export type GoogleCell = string | number | boolean;
export type GoogleTables = {
  days: GoogleCell[][];
  tasks: GoogleCell[][];
};

export const GOOGLE_DAILY_HEADERS: GoogleCell[] = [
  "DATE",
  "DAY",
  "Activity",
  "START TIME",
  "END TIME",
  "HRS",
  "STATUS",
  "REMARK",
];

export function entriesToDayRecords(entries: Entries): DayRecord[] {
  return Object.keys(entries)
    .sort()
    .map((dateKey) => {
      const date = parseISO(dateKey);
      const entry = entries[dateKey];
      const holiday = isHoliday(date, entry);
      const logged = !holiday && (entry?.logged ?? false);
      const time = dayTimeTotals(entry);
      const studyMinutes = logged ? time.study : 0;
      return {
        date,
        key: dateKey,
        holiday,
        logged,
        studyMinutes,
        miscMinutes: logged ? time.misc : 0,
        remark: entry?.remark ?? "",
        tasks: entry?.tasks ?? [],
        ...(entry && logged ? { timeLog: effectiveTimeLog(entry) } : {}),
        ...(entry?.leave ? { leave: true } : {}),
        ...(entry?.importantTask ? { importantTask: entry.importantTask } : {}),
        teachingMinutes: logged ? time.teaching : 0,
        breakMinutes: logged ? time.breaks : 0,
        freeMinutes: logged ? time.free : 0,
      };
    });
}

/**
 * Format daily activities into the user-facing timesheet columns:
 * DATE | DAY | Activity | START TIME | END TIME | HRS | STATUS | REMARK
 */
export function buildGoogleTables(entries: Entries): GoogleTables {
  const days: GoogleCell[][] = [GOOGLE_DAILY_HEADERS];
  const dayRecords = entriesToDayRecords(entries);
  const rows = activityRows(dayRecords);
  for (const r of rows) {
    days.push([
      r.date,
      r.day,
      r.activity,
      r.start,
      r.end,
      r.hours,
      r.status,
      r.remark,
    ]);
  }

  const tasks: GoogleCell[][] = [
    [
      "Date",
      "Task ID",
      "Title",
      "Status",
      "Planned minutes",
      "Logged minutes",
      "Priority",
      "Due date",
      "Subject",
      "Tags (JSON)",
      "Resource URL",
      "Notes",
      "Carried from",
    ],
  ];

  for (const date of Object.keys(entries).sort()) {
    const entry = entries[date];
    const holiday = isHoliday(parseISO(date), entry);
    const logged = !holiday && entry.logged;

    // IDs are stable within a day; sorting a copy never changes the app's order.
    const dayTasks = [...(entry.tasks ?? [])].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    for (const task of dayTasks) {
      tasks.push([
        date,
        task.id,
        task.title,
        TASK_STATUSES[task.status],
        task.minutes ?? 0,
        logged && entry.timeMode !== "activities" ? (task.minutes ?? 0) : 0,
        task.priority ?? "",
        task.dueDate ?? "",
        task.subject ?? "",
        JSON.stringify(task.tags ?? []),
        task.resourceUrl ?? "",
        task.notes,
        task.carriedFrom ?? "",
      ]);
    }
  }

  return { days, tasks };
}

/**
 * Preserve the complete restore format with canonical field and date ordering
 * so the browser and server hash the same snapshot. Keep the user's task order.
 */
export function buildGoogleBackup(entries: Entries): string {
  const validated = decodeEntries(encodeEntries(entries));
  const sorted: Entries = {};
  for (const date of Object.keys(validated).sort()) {
    sorted[date] = validated[date];
  }
  return encodeEntries(sorted);
}
