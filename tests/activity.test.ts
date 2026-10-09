import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseISO } from "date-fns";
import {
  activityRows,
  decodeEntries,
  encodeEntries,
  isHoliday,
  monthDays,
  monthTotals,
  studyInputToMinutes,
  type Entries,
  type LearningTask,
} from "../src/lib/activity";

const month = parseISO("2026-10-01");
const fourHours = {
  studyMinutes: 240,
  remark: "API fundamentals",
  logged: true,
};
test("4 study hours produce 5 misc hours, a 9-hour day, and matching monthly totals", () => {
  const days = monthDays(month, { "2026-10-08": fourHours });
  const totals = monthTotals(days);
  assert.equal(totals.studyMinutes, 240);
  assert.equal(totals.miscMinutes, 300);
  assert.equal(totals.loggedDays, 1);
  assert.equal(totals.workingDays, 27);
  assert.equal(totals.holidays, 4);
  const rows = activityRows(days).filter((r) => r.date === "08/10/2026");
  assert.deepEqual(
    rows.map((r) => [r.activity, r.start, r.end, r.hours]),
    [
      ["Study", "9:00 AM", "1:00 PM", 4],
      ["Miscellaneous", "1:00 PM", "6:00 PM", 5],
    ],
  );
});

const learningTasks: LearningTask[] = [
  {
    id: "react",
    title: "React hooks",
    status: "in-progress",
    notes: "Finish the useEffect exercise",
  },
  {
    id: "api",
    title: "API fundamentals",
    status: "completed",
    notes: "Built a small API",
  },
  {
    id: "testing",
    title: "Integration tests",
    status: "blocked",
    notes: "Waiting for test data",
  },
];

test("multiple tasks preserve independent statuses and notes across saves and holiday changes", () => {
  const entries: Entries = {
    "2026-10-08": { ...fourHours, tasks: learningTasks },
  };
  const saved = decodeEntries(encodeEntries(entries));
  assert.deepEqual(saved, entries);
  const onHoliday = { ...saved["2026-10-08"], holiday: true };
  const holidayDay = monthDays(month, { "2026-10-08": onHoliday }).find(
    (day) => day.key === "2026-10-08",
  )!;
  assert.deepEqual(holidayDay.tasks, learningTasks);
  assert.equal(holidayDay.studyMinutes, 0);
  const restored = monthDays(month, {
    "2026-10-08": { ...onHoliday, holiday: false },
  }).find((day) => day.key === "2026-10-08")!;
  assert.equal(restored.studyMinutes, 240);
  assert.deepEqual(restored.tasks, learningTasks);
});

test("task statuses export separately without duplicating daily hours", () => {
  const days = monthDays(month, {
    "2026-10-08": { ...fourHours, tasks: learningTasks },
  });
  const rows = activityRows(days).filter((row) => row.date === "08/10/2026");
  const tasks = rows.filter((row) => row.activity === "Learning task");
  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((row) => row.status),
    ["In progress", "Completed", "Blocked"],
  );
  assert.match(tasks[0].remark, /React hooks.*Finish the useEffect exercise/);
  assert.equal(
    rows.reduce((total, row) => total + row.hours, 0),
    9,
  );
  assert.ok(
    tasks.every((row) => row.hours === 0 && row.start === "" && row.end === ""),
  );
});

test("planned tasks survive storage and appear in reports without logging a workday", () => {
  const saved = decodeEntries(
    encodeEntries({
      "2026-10-08": {
        studyMinutes: 0,
        remark: "",
        logged: false,
        tasks: learningTasks,
      },
    }),
  );
  const days = monthDays(month, saved);
  assert.equal(monthTotals(days).loggedDays, 0);
  assert.equal(monthTotals(days).miscMinutes, 0);
  assert.equal(
    activityRows(days).filter((row) => row.activity === "Learning task").length,
    3,
  );
});

test("invalid task data is rejected instead of being silently lost", () => {
  const invalidTasks = [
    null,
    [{ ...learningTasks[0], title: " " }],
    [{ ...learningTasks[0], status: "unknown" }],
    [{ ...learningTasks[0], status: "__proto__" }],
    [{ ...learningTasks[0], notes: 42 }],
    [{ ...learningTasks[0], title: "x".repeat(161) }],
    [learningTasks[0], learningTasks[0]],
    Array.from({ length: 101 }, (_, i) => ({
      ...learningTasks[0],
      id: String(i),
    })),
  ];
  for (const tasks of invalidTasks) {
    assert.throws(() =>
      decodeEntries(
        JSON.stringify({
          version: 1,
          entries: {
            "2026-10-08": { ...fourHours, tasks },
          },
        }),
      ),
    );
  }
});
test("unlogged days remain pending with zero hours", () => {
  const days = monthDays(month, {});
  assert.equal(monthTotals(days).miscMinutes, 0);
  const row = activityRows(days).find((r) => r.date === "08/10/2026")!;
  assert.equal(row.hours, 0);
  assert.equal(row.status, "Pending");
  assert.equal(row.start, "");
});
test("Sundays default to holiday and can be explicitly made working days", () => {
  const date = parseISO("2026-10-11");
  assert.equal(isHoliday(date), true);
  assert.equal(isHoliday(date, { ...fourHours, holiday: false }), false);
  const day = monthDays(month, {
    "2026-10-11": { ...fourHours, holiday: false },
  }).find((d) => d.key === "2026-10-11")!;
  assert.equal(day.studyMinutes, 240);
  assert.equal(day.miscMinutes, 300);
});
test("custom holiday hides logged hours while retaining the underlying entry", () => {
  const entry = { ...fourHours, holiday: true };
  assert.equal(
    monthTotals(monthDays(month, { "2026-10-08": entry })).studyMinutes,
    0,
  );
  assert.equal(
    monthTotals(
      monthDays(month, { "2026-10-08": { ...entry, holiday: false } }),
    ).studyMinutes,
    240,
  );
});
test("zero and nine study hours omit zero-length rows and end at 6 PM", () => {
  for (const minutes of [0, 540]) {
    const rows = activityRows(
      monthDays(month, {
        "2026-10-08": { ...fourHours, studyMinutes: minutes },
      }),
    ).filter((r) => r.date === "08/10/2026");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hours, 9);
    assert.equal(rows[0].start, "9:00 AM");
    assert.equal(rows[0].end, "6:00 PM");
  }
});
test("input bounds reject blank, negative, excessive, and nonfinite values", () => {
  for (const value of ["", " ", "-1", "9.1", "NaN", "Infinity"])
    assert.throws(() => studyInputToMinutes(value));
  assert.equal(studyInputToMinutes("0"), 0);
  assert.equal(studyInputToMinutes("4.25"), 255);
  assert.equal(studyInputToMinutes("4.33"), 260);
});
test("rounding uses integer minutes and export durations reconcile", () => {
  const minutes = studyInputToMinutes("4.33");
  const rows = activityRows(
    monthDays(month, { "2026-10-08": { ...fourHours, studyMinutes: minutes } }),
  ).filter((r) => r.date === "08/10/2026");
  assert.equal(rows[0].end, "1:20 PM");
  assert.equal(rows[0].hours + rows[1].hours, 9);
});
test("month totals exclude entries from other months and leap-year dates work", () => {
  const entries: Entries = { "2026-09-30": fourHours, "2026-11-02": fourHours };
  assert.equal(monthTotals(monthDays(month, entries)).loggedDays, 0);
  assert.equal(monthDays(parseISO("2028-02-01"), {}).length, 29);
});
test("storage roundtrip preserves holiday overrides and multilingual remarks", () => {
  const entries = {
    "2026-10-11": { ...fourHours, holiday: false, remark: "പഠനം — OWASP" },
  };
  assert.deepEqual(decodeEntries(encodeEntries(entries)), entries);
  assert.deepEqual(decodeEntries(null), {});
});
test("malformed and future storage schemas are rejected without mutation", () => {
  for (const raw of [
    "{",
    '{"version":2,"entries":{}}',
    '{"version":1,"entries":[]}',
    JSON.stringify({ version: 1, entries: { "2026-02-30": fourHours } }),
    JSON.stringify({
      version: 1,
      entries: { "2026-10-08": { ...fourHours, studyMinutes: 541 } },
    }),
  ])
    assert.throws(() => decodeEntries(raw));
});

test("task time ranges survive saves and reject invalid or reversed times", () => {
  const task: LearningTask = {
    ...learningTasks[0],
    fromTime: "09:30",
    toTime: "11:00",
  };
  const roundTrip = (value: LearningTask) =>
    decodeEntries(
      encodeEntries({ "2026-10-08": { ...fourHours, tasks: [value] } }),
    );
  assert.deepEqual(roundTrip(task)["2026-10-08"].tasks, [task]);
  assert.deepEqual(
    roundTrip({ ...task, fromTime: "", toTime: "" })["2026-10-08"].tasks,
    [{ ...task, fromTime: "", toTime: "" }],
  );
  for (const range of [
    { fromTime: "24:00", toTime: "11:00" },
    { fromTime: "09:60", toTime: "11:00" },
    { fromTime: "11:00", toTime: "09:30" },
    { fromTime: "11:00", toTime: "11:00" },
  ])
    assert.throws(() => roundTrip({ ...task, ...range }));
});
