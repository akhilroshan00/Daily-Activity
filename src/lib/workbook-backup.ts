import { decodeEntries, encodeEntries, type Entries } from "./activity";
export const BACKUP_SHEET = "Daylight restore";
export function workbookBackupRows(entries: Entries) {
  const raw = encodeEntries(decodeEntries(encodeEntries(entries)));
  const rows: string[][] = [["Daylight backup v1"]];
  for (let index = 0; index < raw.length; index += 30000)
    rows.push([raw.slice(index, index + 30000)]);
  return rows;
}
export function readWorkbookBackup(rows: unknown[][]) {
  if (
    rows[0]?.[0] !== "Daylight backup v1" ||
    rows.length > 10000 ||
    rows
      .slice(1)
      .some((row) => typeof row[0] !== "string" || row[0].length > 30000)
  )
    throw new Error(
      "Invalid Daylight workbook backup. Your existing data has been left intact.",
    );
  return decodeEntries(
    rows
      .slice(1)
      .map((row) => row[0])
      .join(""),
  );
}
