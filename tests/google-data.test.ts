import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseISO } from "date-fns";
import {
  decodeEntries,
  monthDays,
  WORK_MINUTES,
  type Entries,
} from "../src/lib/activity";
import { buildGoogleBackup, buildGoogleTables } from "../src/lib/google-data";

test("Google tables keep multiple tasks separate from a single daily total", () => {
  const entries: Entries = {
    "2026-10-08": {
      logged: true,
      studyMinutes: 240,
      remark: "Four hours learning, including one unassigned hour",
      updatedAt: "2026-10-08T13:00:00.000Z",
      tasks: [
        {
          id: "api",
          title: "API",
          status: "completed",
          notes: "",
          minutes: 120,
        },
        {
          id: "react",
          title: "React",
          status: "in-progress",
          notes: "Finish hooks",
          minutes: 60,
        },
      ],
    },
  };
  const tables = buildGoogleTables(entries);
  assert.equal(tables.days.length, 2);
  assert.equal(tables.tasks.length, 3);
  assert.deepEqual(tables.days[1], [
    "2026-10-08",
    false,
    true,
    240,
    300,
    entries["2026-10-08"].remark,
    "2026-10-08T13:00:00.000Z",
  ]);
  assert.equal(
    Number(tables.days[1][3]) + Number(tables.days[1][4]),
    WORK_MINUTES,
  );
  assert.equal(
    tables.tasks.slice(1).reduce((sum, row) => sum + Number(row[5]), 0),
    180,
  );
  assert.deepEqual(
    tables.tasks.slice(1).map((row) => row[3]),
    ["Completed", "In progress"],
  );
});

test("holidays and unlogged plans retain tasks while suppressing actual minutes", () => {
  const entries: Entries = {
    "2026-10-11": {
      logged: true,
      studyMinutes: 90,
      remark: "Sunday plan",
      tasks: [
        { id: "sunday", title: "Plan", status: "todo", notes: "", minutes: 90 },
      ],
    },
    "2026-10-10": {
      holiday: true,
      logged: true,
      studyMinutes: 90,
      remark: "Extra holiday",
      tasks: [
        {
          id: "holiday",
          title: "Plan",
          status: "on-hold",
          notes: "",
          minutes: 90,
        },
      ],
    },
    "2026-10-09": {
      logged: false,
      studyMinutes: 90,
      remark: "Pending",
      tasks: [
        {
          id: "pending",
          title: "Plan",
          status: "blocked",
          notes: "",
          minutes: 90,
        },
      ],
    },
  };
  const tables = buildGoogleTables(entries);
  const appDays = monthDays(parseISO("2026-10-01"), entries);
  for (const row of tables.days.slice(1)) {
    const appDay = appDays.find((day) => day.key === row[0])!;
    assert.deepEqual(row.slice(1, 5), [
      appDay.holiday,
      appDay.logged,
      appDay.studyMinutes,
      appDay.miscMinutes,
    ]);
  }
  assert.deepEqual(
    tables.tasks.slice(1).map((row) => [row[4], row[5]]),
    [
      [90, 0],
      [90, 0],
      [90, 0],
    ],
  );
});

test("explicit working Sundays use actual minutes and unspecified task time stays zero", () => {
  const tables = buildGoogleTables({
    "2026-10-11": {
      holiday: false,
      logged: true,
      studyMinutes: 60,
      remark: "Working Sunday",
      tasks: [
        { id: "reading", title: "Reading", status: "completed", notes: "" },
      ],
    },
  });
  assert.deepEqual(tables.days[1].slice(1, 5), [false, true, 60, 480]);
  assert.deepEqual(tables.tasks[1].slice(4, 6), [0, 0]);
});

test("rows have deterministic date and task ID ordering without mutating stored task order", () => {
  const entries: Entries = {
    "2026-10-09": { logged: false, studyMinutes: 0, remark: "" },
    "2026-10-08": {
      logged: false,
      studyMinutes: 0,
      remark: "",
      tasks: [
        { id: "z", title: "Last", status: "todo", notes: "" },
        { id: "a", title: "First", status: "todo", notes: "" },
      ],
    },
  };
  const tables = buildGoogleTables(entries);
  assert.deepEqual(
    tables.days.slice(1).map((row) => row[0]),
    ["2026-10-08", "2026-10-09"],
  );
  assert.deepEqual(
    tables.tasks.slice(1).map((row) => row.slice(0, 2)),
    [
      ["2026-10-08", "a"],
      ["2026-10-08", "z"],
    ],
  );
  assert.deepEqual(
    entries["2026-10-08"].tasks!.map((task) => task.id),
    ["z", "a"],
  );
  assert.deepEqual(buildGoogleTables({}), {
    days: [tables.days[0]],
    tasks: [tables.tasks[0]],
  });
});

test("Unicode and formula-like text remain literal strings and metadata survives backup restore", () => {
  const entries: Entries = {
    "2026-10-08": {
      logged: true,
      studyMinutes: 30,
      remark: '=HYPERLINK("https://example.com", "പഠനം")',
      timeMode: "tasks",
      updatedAt: "2026-10-08T13:00:00.000Z",
      focusSessions: ["focus-session-1"],
      tasks: [
        {
          id: "unicode",
          title: "=SUM(1,2) പഠനം 🚀",
          status: "completed",
          notes: "+Formula-like notes\nSecond line",
          minutes: 30,
          priority: "high",
          dueDate: "2026-10-10",
          subject: "@subject",
          tags: ["comma,inside", "-tag", "പഠനം"],
          resourceUrl: "https://example.com/learn?q=%3Dformula",
          carriedFrom: "2026-10-07",
        },
      ],
    },
  };
  const tables = buildGoogleTables(entries);
  const task = entries["2026-10-08"].tasks![0];
  assert.equal(tables.days[1][5], entries["2026-10-08"].remark);
  assert.equal(tables.tasks[1][2], task.title);
  assert.equal(tables.tasks[1][11], task.notes);
  assert.deepEqual(tables.tasks[1].slice(6), [
    "high",
    "2026-10-10",
    "@subject",
    JSON.stringify(task.tags),
    task.resourceUrl,
    task.notes,
    "2026-10-07",
  ]);
  const backup = buildGoogleBackup(entries);
  assert.equal(JSON.parse(backup).version, 1);
  assert.deepEqual(decodeEntries(backup), entries);
});

test("backup canonicalizes date and field order for matching snapshot hashes while preserving task order", () => {
  const first: Entries = {
    "2026-10-09": { remark: "Second day", studyMinutes: 0, logged: false },
    "2026-10-08": {
      tasks: [
        { title: "First", notes: "", id: "z", status: "todo" },
        { title: "Second", notes: "", id: "a", status: "todo" },
      ],
      studyMinutes: 0,
      remark: "First day",
      logged: false,
    },
  };
  const second: Entries = {
    "2026-10-08": {
      logged: false,
      remark: "First day",
      studyMinutes: 0,
      tasks: [
        { id: "z", status: "todo", notes: "", title: "First" },
        { id: "a", status: "todo", notes: "", title: "Second" },
      ],
    },
    "2026-10-09": { logged: false, studyMinutes: 0, remark: "Second day" },
  };
  const backup = buildGoogleBackup(first);
  assert.equal(backup, buildGoogleBackup(second));
  assert.deepEqual(Object.keys(decodeEntries(backup)), [
    "2026-10-08",
    "2026-10-09",
  ]);
  assert.deepEqual(
    decodeEntries(backup)["2026-10-08"].tasks!.map((task) => task.id),
    ["z", "a"],
  );
  assert.throws(
    () => buildGoogleBackup({ "invalid-date": first["2026-10-08"] }),
    /Invalid saved date/,
  );
});
