import { decodeEntries, encodeEntries, type Entries } from "./activity";
import {
  scheduleLearning,
  learningTotal,
  effectiveTimeLog,
  validateActivities,
  LUNCH_ID,
} from "./time-log";

export function mergeActivityImport(
  existing: Entries,
  incoming: Entries,
): Entries {
  const result = { ...existing };
  for (const [day, imported] of Object.entries(incoming)) {
    const current = result[day];
    if (!current) {
      result[day] = { ...imported, updatedAt: new Date().toISOString() };
      continue;
    }
    if (
      imported.timeMode === "activities" &&
      imported.timeLog &&
      imported.tasks?.some((task) => task.id.startsWith("xlsx:ai:"))
    ) {
      const additions = imported.tasks.filter(
        (task) =>
          !(current.tasks ?? []).some(
            (old) =>
              old.id === task.id ||
              (old.title === task.title &&
                old.fromTime === task.fromTime &&
                old.toTime === task.toTime),
          ),
      );
      if (!additions.length) continue;
      const existingLog = current.logged
        ? effectiveTimeLog(current)
        : (current.timeLog ?? {
            blocks: [],
            miscAdjustment: 0,
            extraFreeMinutes: 0,
          });
      const newBlocks = imported.timeLog.blocks.filter(
        (block) =>
          block.id !== LUNCH_ID &&
          additions.some(
            (task) =>
              block.id === task.id || block.id === `${task.id}:after-lunch`,
          ),
      );
      let log;
      try {
        log = validateActivities({
          ...existingLog,
          blocks: [...existingLog.blocks, ...newBlocks],
        });
      } catch {
        throw new Error(
          `${day}: the imported activities overlap saved times. Adjust the spreadsheet or saved day before importing. Your logs are unchanged.`,
        );
      }
      result[day] = {
        ...current,
        tasks: [...(current.tasks ?? []), ...additions],
        timeLog: log,
        timeMode: "activities",
        studyMinutes: learningTotal(log),
        logged: current.logged || imported.logged,
        updatedAt: new Date().toISOString(),
      };
      continue;
    }
    const ids = new Set((current.tasks ?? []).map((task) => task.id));
    const additions = (imported.tasks ?? []).filter(
      (task) => !ids.has(task.id),
    );
    const timeLog = current.timeLog ?? imported.timeLog;
    if (!additions.length && timeLog === current.timeLog) continue;
    const tasks = [...(current.tasks ?? []), ...additions];
    const total = tasks.reduce((sum, task) => sum + (task.minutes ?? 0), 0);
    result[day] = {
      ...current,
      tasks,
      ...(timeLog ? { timeLog } : {}),
      ...(current.importantTask === undefined &&
      imported.importantTask !== undefined
        ? { importantTask: imported.importantTask }
        : {}),
      studyMinutes:
        current.timeMode === "activities"
          ? learningTotal(timeLog!)
          : current.timeMode === "tasks"
            ? Math.max(total, scheduleLearning(timeLog))
            : Math.max(current.studyMinutes, total, scheduleLearning(timeLog)),
      logged: current.logged || imported.logged,
      holiday: current.holiday ?? imported.holiday,
      updatedAt: new Date().toISOString(),
    };
  }
  return decodeEntries(encodeEntries(result));
}
