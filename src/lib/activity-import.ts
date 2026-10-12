import * as XLSX from "xlsx";
import {
  decodeEntries,
  encodeEntries,
  validDateKey,
  TASK_STATUSES,
  TASK_TITLE_LIMIT,
  REMARK_LIMIT,
  type Entries,
  type TaskStatus,
} from "./activity";
import { timeRangeMinutes } from "./task-time";
import { BACKUP_SHEET, readWorkbookBackup } from "./workbook-backup";

export type ActivityImport = { entries: Entries; warnings: string[] };
export type ImportOptions = {
  durationSource?: "times" | "hours";
  dateCorrections?: Record<string, string>;
};

export { mergeActivityImport } from "./activity-import-merge";

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function parseDate(value: unknown) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return "";
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const input = text(value);
  if (validDateKey(input)) return input;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(input);
  if (!match) return "";
  const [, first, second, year] = match;
  // Excel's text fallback is month/day/year; numeric date cells are unambiguous.
  const month = Number(first) > 12 ? second : first;
  const day = Number(first) > 12 ? first : second;
  return `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseTime(value: unknown, after?: string) {
  if (typeof value === "number" && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % 1440;
    return {
      time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      inferred: false,
    };
  }
  const match = /^(\d{1,2})[:;](\d{2})\s*(am|pm)?$/i.exec(text(value));
  if (!match) return { time: "", inferred: false };
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23 || (match[3] && (hour < 1 || hour > 12)))
    return { time: "", inferred: false };
  if (match[3]) hour = (hour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  else if (hour >= 1 && hour <= 8) hour += 12;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    time: after && time <= after ? "" : time,
    inferred: !match[3] && hour <= 20,
  };
}

function parseDuration(value: unknown) {
  if (typeof value === "number") return Math.round(value * 60);
  const input = text(value).toLowerCase().replace(/\s+/g, "");
  const minutes = /^(\d+(?:\.\d+)?)min(?:utes?)?$/.exec(input);
  if (minutes) return Math.round(Number(minutes[1]));
  const clock = /^(\d+)[:.](\d{2})hr(?:s)?$/.exec(input);
  if (clock && clock[2] === "30") return Number(clock[1]) * 60 + 30;
  const hours = /^(\d+(?:\.\d+)?)(?:hr(?:s)?|hours?)?$/.exec(input);
  return hours ? Math.round(Number(hours[1]) * 60) : null;
}

function parseStatus(value: unknown): TaskStatus {
  const status = text(value)
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
  for (const [key, label] of Object.entries(TASK_STATUSES)) {
    if (status === label.toLowerCase() || status === key.replace(/-/g, " "))
      return key as TaskStatus;
  }
  throw new Error(`Unknown activity status: ${text(value) || "blank"}.`);
}

export function parseActivityWorkbook(
  bytes: ArrayBuffer | Uint8Array,
  options: ImportOptions = {},
): ActivityImport {
  const workbook = XLSX.read(bytes, { type: "array" });
  if (workbook.Sheets[BACKUP_SHEET])
    return {
      entries: readWorkbookBackup(
        XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[BACKUP_SHEET], {
          header: 1,
          raw: true,
          defval: "",
        }),
      ),
      warnings: [
        "Daylight workbook: original tasks, activities, breaks and notes restored from the saved snapshot. Edits to visible report sheets are not imported. Matching dates keep existing activities.",
      ],
    };
  const entries: Entries = {};
  const warnings: string[] = [];
  let taskCount = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const headerIndex = rows.findIndex(
      (row) =>
        row.some((cell) => text(cell).toUpperCase() === "DATE") &&
        row.some((cell) => text(cell).toUpperCase() === "ACTIVITY"),
    );
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map((cell) => text(cell).toUpperCase());
    const column = (name: string) => headers.indexOf(name);
    if (column("STATUS") < 0)
      throw new Error(`${sheetName}: missing STATUS column.`);
    let day = "";
    for (let index = headerIndex + 1; index < rows.length; index++) {
      const row = rows[index];
      const title = text(row[column("ACTIVITY")]);
      if (!title || title === "Holiday" || title === "Not logged") continue;
      const location = `${sheetName}, row ${index + 1}`;
      const dateValue = row[column("DATE")];
      if (text(dateValue)) day = parseDate(dateValue);
      if (!validDateKey(day))
        throw new Error(`${location}: enter a valid date for this activity.`);
      const sourceDay = day;
      const correctedDay = options.dateCorrections?.[day] ?? day;
      if (!validDateKey(correctedDay))
        throw new Error(`${location}: invalid corrected date.`);
      if (title.length > TASK_TITLE_LIMIT)
        throw new Error(`${location}: activity title is too long.`);
      const formattedValue = (name: string) => {
        const col = column(name);
        return col < 0
          ? ""
          : (sheet[XLSX.utils.encode_cell({ r: index, c: col })]?.w ??
              row[col]);
      };
      const startValue = formattedValue("START TIME");
      const endValue = formattedValue("END TIME");
      const hoursValue = row[column("HRS")];
      const start = parseTime(startValue);
      const end = parseTime(endValue, start.time || undefined);
      if ((text(startValue) && !start.time) || (text(endValue) && !end.time))
        throw new Error(`${location}: check the start and end times.`);
      const ranged = timeRangeMinutes(start.time, end.time);
      if (start.time && end.time && ranged === null)
        throw new Error(`${location}: end time must be later than start time.`);
      const stated = parseDuration(hoursValue);
      if (text(hoursValue) && stated === null)
        throw new Error(`${location}: check the HRS value.`);
      const minutes =
        (options.durationSource === "hours"
          ? (stated ?? ranged)
          : (ranged ?? stated)) ?? 0;
      const notes = [
        text(row[column("REMARK")]),
        `Source: ${location}.`,
        `Original time: ${text(startValue) || "not supplied"}–${text(endValue) || "not supplied"}; HRS: ${text(hoursValue) || "not supplied"}.`,
      ];
      if (correctedDay !== sourceDay) {
        const warning = `${location}: date corrected from ${sourceDay} to ${correctedDay} as requested.`;
        notes.push(warning);
        warnings.push(warning);
      }
      if (ranged !== null && stated !== null && ranged !== stated) {
        const warning = `${location}: HRS differs from start/end times; using ${minutes} minutes.`;
        warnings.push(warning);
        notes.push(warning);
      }
      if (start.inferred || end.inferred) {
        const warning = `${location}: time without AM/PM interpreted within the working day.`;
        warnings.push(warning);
        notes.push(warning);
      }
      const weekday = text(row[column("DAY")]).toLowerCase();
      const actualWeekday = new Date(`${correctedDay}T12:00:00Z`)
        .toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })
        .toLowerCase();
      if (weekday && !actualWeekday.startsWith(weekday.slice(0, 2))) {
        const warning = `${location}: ${correctedDay} is ${actualWeekday}, but DAY says ${text(row[column("DAY")])}. Date kept as written.`;
        warnings.push(warning);
        notes.push(warning);
      }
      const entry = entries[correctedDay] ?? {
        studyMinutes: 0,
        remark: "",
        holiday: false,
        logged: true,
        timeMode: "tasks",
        tasks: [],
      };
      entry.tasks!.push({
        id: `xlsx:${sheetName}:${index + 1}`,
        title,
        status: parseStatus(row[column("STATUS")]),
        notes: notes.join("\n"),
        minutes,
        ...(start.time ? { fromTime: start.time } : {}),
        ...(end.time ? { toTime: end.time } : {}),
      });
      if (entry.tasks![entry.tasks!.length - 1].notes.length > REMARK_LIMIT)
        throw new Error(
          `${location}: notes are too long; shorten the source remark.`,
        );
      entry.studyMinutes += minutes;
      entries[correctedDay] = entry;
      taskCount++;
    }
  }
  if (!taskCount)
    throw new Error(
      "No activity rows found. Choose a workbook with DATE, Activity, START TIME, END TIME, HRS and STATUS columns.",
    );
  return { entries: decodeEntries(encodeEntries(entries)), warnings };
}
