import {
  decodeEntries,
  encodeEntries,
  studyInputToMinutes,
  durationLabel,
  type DayEntry,
  type LearningTask,
} from "./activity";
import { taskMinutes } from "./learning";

export function dailyHours(entry?: DayEntry) {
  if (!entry?.logged) return "";
  const minutes = Math.max(
    entry?.studyMinutes ?? 0,
    taskMinutes(entry?.tasks ?? []),
  );
  return String(Number((minutes / 60).toFixed(4)));
}

export function buildDailyEntry(
  day: string,
  previous: DayEntry | undefined,
  tasks: LearningTask[],
  hours: string,
  holiday: boolean,
): DayEntry {
  if (tasks.some((task) => !task.title.trim()))
    throw new Error("Give every task a title, or remove the empty task.");
  const recorded = taskMinutes(tasks);
  const planning = tasks.length > 0 && !hours.trim();
  const minutes = holiday
    ? hours.trim()
      ? studyInputToMinutes(hours)
      : Math.max(previous?.studyMinutes ?? 0, recorded)
    : planning
      ? Math.max(previous?.logged ? 0 : (previous?.studyMinutes ?? 0), recorded)
      : studyInputToMinutes(hours);
  if (minutes < recorded)
    throw new Error(
      `Your saved task and focus time is ${durationLabel(recorded)}. Enter at least that much in daily learning hours.`,
    );
  const entry: DayEntry = {
    studyMinutes: minutes,
    remark: previous?.remark ?? "",
    holiday,
    logged: holiday
      ? Boolean(hours.trim()) || (previous?.logged ?? false)
      : !planning,
    tasks: tasks.map((task) => ({
      ...task,
      title: task.title.trim(),
      notes: task.notes.trim(),
    })),
    timeMode: "manual",
    focusSessions: previous?.focusSessions ?? [],
  };
  return decodeEntries(encodeEntries({ [day]: entry }))[day];
}
