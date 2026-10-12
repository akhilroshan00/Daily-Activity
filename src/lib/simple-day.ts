import { decodeEntries, encodeEntries, type DayEntry } from "./activity";
import {
  validateTimeLog,
  effectiveTimeLog,
  validateActivities,
  learningTotal,
  LUNCH_ID,
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
  const validated = log ? validateActivities(log) : undefined;
  const studyMinutes = useActivities
    ? learningTotal(validated!)
    : (previous?.studyMinutes ?? 0);
  const entry: DayEntry = {
    ...previous,
    studyMinutes,
    remark: remark.trim(),
    logged: useActivities
      ? Boolean(
          validated!.blocks.some((block) => block.id !== LUNCH_ID) ||
          validated!.extraFreeMinutes,
        )
      : (previous?.logged ?? false),
    holiday: type === "holiday",
    leave: type === "leave",
    ...(validated ? { timeLog: validated } : {}),
    ...(useActivities ? { timeMode: "activities" } : {}),
  };
  return decodeEntries(encodeEntries({ [day]: entry }))[day];
}

export function legacyActivityLog(entry: DayEntry): TimeLog {
  return validateTimeLog(effectiveTimeLog(entry));
}
