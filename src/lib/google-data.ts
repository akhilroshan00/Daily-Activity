import { parseISO } from "date-fns";
import {
  decodeEntries,
  encodeEntries,
  isHoliday,
  TASK_STATUSES,
  WORK_MINUTES,
  type Entries,
} from "./activity";

export type GoogleCell = string | number | boolean;
export type GoogleTables = {
  days: GoogleCell[][];
  tasks: GoogleCell[][];
};

/**
 * Keep daily totals separate from task rows so a day with several tasks is not
 * counted several times. The Google API writer must use literal stringValue
 * cells for strings; user text, including strings beginning with "=", is data.
 */
export function buildGoogleTables(entries: Entries): GoogleTables {
  const days: GoogleCell[][] = [
    [
      "Date",
      "Holiday",
      "Logged",
      "Learning minutes",
      "Miscellaneous minutes",
      "Remarks",
      "Updated at",
    ],
  ];
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
    const learningMinutes = logged ? entry.studyMinutes : 0;

    days.push([
      date,
      holiday,
      logged,
      learningMinutes,
      logged ? WORK_MINUTES - learningMinutes : 0,
      entry.remark,
      entry.updatedAt ?? "",
    ]);

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
        logged ? (task.minutes ?? 0) : 0,
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
