import { decodeEntries, encodeEntries, type Entries } from "./activity";
import { mergeActivityImport } from "./activity-import-merge";
import {
  readWorkspaceEntries,
  workspaceKeys,
  writeWorkspaceEntries,
} from "./workspace-storage";

type ImportStorage = Pick<Storage, "getItem" | "setItem">;
export type CloudImportRow = { user_id: string; entries: unknown };

export function spreadsheetImportKey(userId: string) {
  return `${workspaceKeys(userId).activity}:spreadsheet-imports`;
}

// Import spreadsheet tasks once per device. Receipts protect subsequent edits
// and intentional deletions when the workspace is opened again.
export function applyWorkspaceSpreadsheetImport(
  storage: ImportStorage,
  userId: string,
  row: CloudImportRow,
): Entries {
  if (row.user_id !== userId)
    throw new Error("Spreadsheet activities belong to a different account.");
  const latest = readWorkspaceEntries(storage, userId);
  const incoming = decodeEntries(
    JSON.stringify({ version: 1, entries: row.entries }),
  );
  const key = spreadsheetImportKey(userId);
  const raw = storage.getItem(key);
  const receipt: unknown = raw === null ? [] : JSON.parse(raw);
  if (
    !Array.isArray(receipt) ||
    receipt.some(
      (id) =>
        typeof id !== "string" || id.length > 120 || !id.includes(":xlsx:"),
    )
  ) {
    throw new Error(
      "Invalid spreadsheet import history. Existing activities were kept.",
    );
  }
  const seen = new Set<string>(receipt);
  const additions: Entries = {};
  for (const [date, day] of Object.entries(incoming)) {
    const tasks = (day.tasks ?? []).filter(
      (task) => task.id.startsWith("xlsx:") && !seen.has(`${date}:${task.id}`),
    );
    if (!tasks.length) continue;
    additions[date] = {
      ...day,
      tasks,
      studyMinutes: tasks.reduce((sum, task) => sum + (task.minutes ?? 0), 0),
      timeMode: "tasks",
    };
    for (const task of tasks) seen.add(`${date}:${task.id}`);
  }
  if (!Object.keys(additions).length) return latest;
  const merged = mergeActivityImport(latest, additions);
  // Retain a recovery copy before adding activities to an existing device log.
  if (!storage.getItem(`${key}:before`) && Object.keys(latest).length) {
    storage.setItem(`${key}:before`, encodeEntries(latest));
  }
  writeWorkspaceEntries(storage, userId, merged);
  storage.setItem(key, JSON.stringify([...seen]));
  return merged;
}
