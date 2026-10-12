import {
  decodeEntries,
  encodeEntries,
  WORK_START,
  WORK_MINUTES,
  type DayEntry,
} from "./activity";
import {
  blockMinutes,
  clockMinutes,
  scheduleLearning,
  validateTimeLog,
  type TimeBlock,
  type TimeLog,
} from "./time-log";
export type DayType = "working" | "leave" | "holiday";

export function buildSimpleDay(
  day: string,
  previous: DayEntry | undefined,
  log: TimeLog | undefined,
  type: DayType,
  remark: string,
): DayEntry {
  const changed = JSON.stringify(log) !== JSON.stringify(previous?.timeLog);
  const useActivities =
    Boolean(log) && (changed || previous?.timeMode === "activities");
  const validated = log ? validateTimeLog(log) : undefined;
  const studyMinutes = useActivities
    ? scheduleLearning(validated)
    : (previous?.studyMinutes ?? 0);
  const entry: DayEntry = {
    ...previous,
    studyMinutes,
    remark: remark.trim(),
    logged: useActivities
      ? Boolean(validated!.blocks.length || validated!.extraFreeMinutes)
      : (previous?.logged ?? false),
    holiday: type === "holiday",
    leave: type === "leave",
    ...(validated ? { timeLog: validated } : {}),
    ...(useActivities ? { timeMode: "activities" } : {}),
  };
  return decodeEntries(encodeEntries({ [day]: entry }))[day];
}

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
// Converting legacy allocations is explicit. Preserve their total; use original task ranges when they reconcile.
export function legacyActivityLog(entry: DayEntry): TimeLog {
  const learning = (entry.tasks ?? [])
    .filter((task) => (task.minutes ?? 0) > 0)
    .map((task) => ({
      id: `old:${task.id.slice(0, 90)}`,
      start: task.fromTime ?? "",
      end: task.toTime ?? "",
      category: "studying" as const,
      topic: task.title,
    }));
  const log = { blocks: learning, miscAdjustment: 0, extraFreeMinutes: 0 };
  let exact =
    learning.length > 0 &&
    learning.every((block) => block.start >= "09:00" && block.end <= "18:00") &&
    learning.reduce((sum, block) => sum + blockMinutes(block), 0) ===
      entry.studyMinutes;
  try {
    validateTimeLog(log);
  } catch {
    exact = false;
  }
  if (!exact) {
    log.blocks = entry.studyMinutes
      ? [
          {
            id: "legacy:learning",
            start: "09:00",
            end: clock(WORK_START + entry.studyMinutes),
            category: "studying",
            topic: "Saved learning",
          },
        ]
      : [];
  }
  const blocks: TimeBlock[] = [...log.blocks].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  let cursor = WORK_START;
  for (const block of [...blocks]) {
    const start = clockMinutes(block.start);
    if (start > cursor)
      blocks.push({
        id: `legacy:misc:${cursor}`,
        start: clock(cursor),
        end: block.start,
        category: "misc",
        topic: "Saved miscellaneous",
      });
    cursor = clockMinutes(block.end);
  }
  if (cursor < WORK_START + WORK_MINUTES)
    blocks.push({
      id: `legacy:misc:${cursor}`,
      start: clock(cursor),
      end: "18:00",
      category: "misc",
      topic: "Saved miscellaneous",
    });
  return validateTimeLog({
    ...log,
    blocks: blocks.sort((a, b) => a.start.localeCompare(b.start)),
  });
}
