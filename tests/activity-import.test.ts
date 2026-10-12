import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  parseActivityWorkbook,
  mergeActivityImport,
} from "../src/lib/activity-import";
import {
  activityRows,
  decodeEntries,
  encodeEntries,
  monthDays,
  type Entries,
} from "../src/lib/activity";
import { buildDailyEntry } from "../src/lib/day-editor";
import { updateTaskTime } from "../src/lib/task-time";
import { carryTasks } from "../src/lib/learning";

function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["", "Daily Activity"],
      [
        "DATE",
        "DAY",
        "Activity",
        "START TIME ",
        "END TIME",
        "HRS",
        "STATUS",
        "REMARK",
      ],
      ...rows,
    ]),
    "Activities",
  );
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

test("Excel import carries dates, preserves source values and reconciles actual time ranges", () => {
  const result = parseActivityWorkbook(
    workbook([
      [
        "9/18/26",
        "Friday",
        "Presentation",
        "12:00PM",
        "2:30PM",
        "3.5HR",
        "Completed",
        "Covered APIs",
      ],
      ["", "", "Meeting", "4:30PM", "5:00PM", "30MIN", "In Progress", ""],
      ["10/12/26", "Monday", "", "", "", "", "", ""],
    ]),
  );
  const day = result.entries["2026-09-18"];
  assert.equal(day.studyMinutes, 180);
  assert.equal(day.tasks?.length, 2);
  assert.equal(day.tasks?.[0].fromTime, "12:00");
  assert.equal(day.tasks?.[0].toTime, "14:30");
  assert.equal(day.tasks?.[0].status, "completed");
  assert.match(day.tasks![0].notes, /Covered APIs[\s\S]*3.5HR/);
  assert.equal(day.tasks?.[1].status, "in-progress");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.entries["2026-10-12"], undefined);
  assert.deepEqual(
    decodeEntries(encodeEntries(result.entries)),
    result.entries,
  );
  const report = activityRows(
    monthDays(new Date(2026, 8, 1), result.entries),
  ).filter((row) => row.activity === "Learning task");
  assert.deepEqual(
    report.map((row) => [row.start, row.end, row.hours]),
    [
      ["12:00 PM", "2:30 PM", 2.5],
      ["4:30 PM", "5:00 PM", 0.5],
    ],
  );
});

test("requested date corrections, bare afternoon times and punctuation are preserved in notes", () => {
  const bytes = workbook([
    [
      "9/7/26",
      "Wednesday",
      "Class",
      "9:30am",
      "11:30am",
      "2hr",
      "Completed",
      "",
    ],
    ["", "", "Practice", "2:30", "5;30PM", "3hr", "In Progress", ""],
  ]);
  const result = parseActivityWorkbook(bytes, {
    dateCorrections: { "2026-09-07": "2026-10-07" },
  });
  assert.equal(result.entries["2026-09-07"], undefined);
  assert.equal(result.entries["2026-10-07"].studyMinutes, 300);
  assert.equal(result.entries["2026-10-07"].tasks?.[1].fromTime, "14:30");
  assert.equal(result.entries["2026-10-07"].tasks?.[1].toTime, "17:30");
  assert.match(result.entries["2026-10-07"].tasks![0].notes, /2026-09-07/);
  assert.ok(parseActivityWorkbook(bytes).entries["2026-09-07"]);
});

test("HRS preference and untimed durations work, invalid source data is rejected", () => {
  const bytes = workbook([
    [
      "10/1/26",
      "Thursday",
      "Study",
      "12:00PM",
      "5;30PM",
      "6HR",
      "In Progress",
      "",
    ],
  ]);
  assert.equal(
    parseActivityWorkbook(bytes).entries["2026-10-01"].studyMinutes,
    330,
  );
  assert.equal(
    parseActivityWorkbook(bytes, { durationSource: "hours" }).entries[
      "2026-10-01"
    ].studyMinutes,
    360,
  );
  const untimed = workbook([
    ["10/1/26", "Thursday", "Study", "", "", "3:30HR", "Completed", ""],
  ]);
  assert.equal(
    parseActivityWorkbook(untimed).entries["2026-10-01"].studyMinutes,
    210,
  );
  for (const row of [
    ["", "", "Study", "9:00AM", "10:00AM", "1HR", "Completed", ""],
    ["10/1/26", "", "Study", "12:00PM", "10:00AM", "1HR", "Completed", ""],
    ["10/1/26", "", "Study", "9:00AM", "7:00PM", "10HR", "Completed", ""],
    ["10/1/26", "", "Study", "9:00AM", "10:00AM", "1HR", "unknown", ""],
  ])
    assert.throws(() => parseActivityWorkbook(workbook([row])));
});

test("merging adds tasks without replacing notes, losing existing time or duplicating a reimport", () => {
  const incoming = parseActivityWorkbook(
    workbook([
      [
        "10/1/26",
        "Thursday",
        "Study",
        "12:00PM",
        "1:00PM",
        "1HR",
        "Completed",
        "",
      ],
    ]),
  ).entries;
  const existing: Entries = {
    "2026-10-01": {
      studyMinutes: 240,
      remark: "My reflection",
      logged: true,
      timeMode: "manual",
      tasks: [
        {
          id: "current",
          title: "Current task",
          status: "todo",
          notes: "Keep me",
        },
      ],
    },
  };
  const merged = mergeActivityImport(existing, incoming);
  assert.equal(merged["2026-10-01"].studyMinutes, 240);
  assert.equal(merged["2026-10-01"].remark, "My reflection");
  assert.equal(merged["2026-10-01"].tasks?.length, 2);
  assert.deepEqual(mergeActivityImport(merged, incoming), merged);
  assert.equal(existing["2026-10-01"].tasks?.length, 1);
});

test("task time editing drives daily totals and carrying a task resets its time range", () => {
  const task = updateTaskTime(
    { id: "task", title: "Practice", notes: "", status: "in-progress" },
    { fromTime: "09:30", toTime: "10:15" },
  );
  assert.equal(task.minutes, 45);
  const entry = buildDailyEntry(
    "2026-10-01",
    undefined,
    [task],
    "0.75",
    false,
    "tasks",
  );
  assert.equal(entry.studyMinutes, 45);
  assert.equal(entry.logged, true);
  assert.equal(entry.timeMode, "tasks");
  assert.equal(updateTaskTime(task, { toTime: "11:00" }).minutes, 90);
  assert.equal(updateTaskTime(task, { toTime: "" }).minutes, 0);
  const carried = carryTasks(
    { "2026-10-01": entry },
    "2026-10-01",
    "2026-10-02",
    [task.id],
  );
  assert.equal(carried["2026-10-02"].tasks?.[0].minutes, 0);
  assert.equal(carried["2026-10-02"].tasks?.[0].fromTime, "");
  assert.equal(carried["2026-10-02"].tasks?.[0].toTime, "");
});
