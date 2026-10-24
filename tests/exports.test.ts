import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  activityRows,
  monthDays,
  type DayEntry,
  type Entries,
} from "../src/lib/activity";
import {
  buildActivityWorkbook,
  pdfText,
  reportSummary,
} from "../src/lib/exports";
import { learningTopics, learningTotal } from "../src/lib/time-log";

const log = {
  blocks: [
    {
      id: "a",
      start: "09:00",
      end: "13:30",
      category: "studying" as const,
      topic: "React",
    },
    {
      id: "b",
      start: "14:30",
      end: "16:00",
      category: "studying" as const,
      topic: "React",
    },
  ],
  miscAdjustment: 0,
  extraFreeMinutes: 0,
};
const day: DayEntry = {
  studyMinutes: learningTotal(log),
  remark: "",
  logged: true,
  timeMode: "activities",
  timeLog: log,
  tasks: [
    {
      id: "t1",
      title: "Hooks",
      notes: "",
      status: "in-progress",
      minutes: 60,
      fromTime: "09:00",
      toTime: "10:00",
    },
  ],
};
const entries: Entries = { "2026-10-05": day };
const month = new Date(2026, 9, 1);

test("report pending days only count working days up to today", () => {
  const days = monthDays(month, entries);
  const summary = reportSummary(days, "2026-10-07");
  // 1-7 October 2026: Sunday the 4th is a holiday and the 5th is logged.
  assert.equal(summary.pendingDays, 5);
  assert.equal(reportSummary(days, "2026-09-30").pendingDays, 0);
});

test("work hours exclude lunch while logged time keeps the full day", () => {
  const summary = reportSummary(monthDays(month, entries), "2026-10-31");
  assert.equal(summary.workMinutes, summary.studyMinutes + summary.miscMinutes);
  // A 09:00-18:00 day with a 13:30-14:30 lunch is 8 working hours of 9 logged.
  assert.equal(summary.workMinutes, 480);
  assert.equal(summary.loggedMinutes, 540);
});

test("a topic split around lunch is listed once with its full time", () => {
  assert.deepEqual(learningTopics(day), [{ topic: "React", minutes: 360 }]);
});

test("schedule task rows use the same clock format as activity rows", () => {
  const rows = activityRows(monthDays(month, entries)).filter(
    (row) => row.activity === "Learning task",
  );
  assert.equal(rows[0].start, "9:00 AM");
  assert.equal(rows[0].end, "10:00 AM");
});

test("the Excel workbook reports readable statuses and consistent totals", async () => {
  const days = monthDays(month, entries);
  const workbook = await buildActivityWorkbook(
    month,
    days,
    "month",
    entries,
    "2026-10-07",
  );
  const tasks = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["Task details"],
  );
  assert.equal(tasks[0].Status, "In progress");
  const sheet = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets["2026-10"],
    { header: 1 },
  );
  const value = (label: string) =>
    sheet.find((row) => row.includes(label))?.filter((cell) => cell !== "")[1];
  assert.equal(value("Pending working days"), 5);
  assert.equal(value("Work hours"), 8);
  assert.equal(value("MONTHLY TOTALS"), 9);
});

test("PDF text keeps accented letters and dashes the font supports", () => {
  assert.equal(pdfText("Café – naïve “quote”"), "Café – naïve “quote”");
  assert.equal(pdfText("日本"), "??");
});

test("task detail exports use AM/PM while restore snapshots retain their original times", async () => {
  const workbook = await buildActivityWorkbook(month, monthDays(month, entries), "month", entries, "2026-10-07");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Task details"]);
  assert.equal(rows[0]["From time"], "9:00 AM");
  assert.equal(rows[0]["To time"], "10:00 AM");
  assert.equal(entries["2026-10-05"].tasks![0].fromTime, "09:00");
});
