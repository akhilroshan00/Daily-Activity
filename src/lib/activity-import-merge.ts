import { decodeEntries, encodeEntries, type Entries } from "./activity";

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
    const ids = new Set((current.tasks ?? []).map((task) => task.id));
    const additions = (imported.tasks ?? []).filter(
      (task) => !ids.has(task.id),
    );
    if (!additions.length) continue;
    const tasks = [...(current.tasks ?? []), ...additions];
    const total = tasks.reduce((sum, task) => sum + (task.minutes ?? 0), 0);
    result[day] = {
      ...current,
      tasks,
      studyMinutes:
        current.timeMode === "tasks"
          ? total
          : Math.max(current.studyMinutes, total),
      logged: current.logged || imported.logged,
      holiday: current.holiday ?? imported.holiday,
      updatedAt: new Date().toISOString(),
    };
  }
  return decodeEntries(encodeEntries(result));
}
