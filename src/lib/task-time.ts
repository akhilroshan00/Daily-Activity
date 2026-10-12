import { type LearningTask } from "./activity";

export function timeToMinutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeRangeMinutes(fromTime?: string, toTime?: string) {
  const from = timeToMinutes(fromTime ?? "");
  const to = timeToMinutes(toTime ?? "");
  return from !== null && to !== null && to > from ? to - from : null;
}

export function updateTaskTime(
  task: LearningTask,
  changes: Partial<Pick<LearningTask, "fromTime" | "toTime">>,
): LearningTask {
  const next = { ...task, ...changes };
  const minutes = timeRangeMinutes(next.fromTime, next.toTime);
  return { ...next, minutes: minutes ?? 0 };
}
