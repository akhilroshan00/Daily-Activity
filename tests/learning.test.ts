import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseISO } from "date-fns";
import {
  activityRows,
  decodeEntries,
  encodeEntries,
  monthDays,
  monthTotals,
  type Entries,
} from "../src/lib/activity";
import {
  addFocusMinutes,
  carryTasks,
  elapsedSeconds,
  learningStreak,
  mergeCloudResult,
  mergeEntries,
  weekLearning,
} from "../src/lib/learning";

const timed: Entries = {
  "2026-10-08": {
    studyMinutes: 150,
    logged: true,
    timeMode: "tasks",
    remark: "Practised",
    tasks: [
      {
        id: "react",
        title: "React",
        status: "in-progress",
        notes: "Hooks",
        minutes: 90,
        subject: "Frontend",
        priority: "high",
        tags: ["react", "hooks"],
        resourceUrl: "https://react.dev",
        dueDate: "2026-10-09",
      },
      { id: "api", title: "API", status: "completed", notes: "", minutes: 60 },
    ],
  },
};
test("task time metadata round-trips and export blocks total exactly nine hours", () => {
  const entries = decodeEntries(encodeEntries(timed));
  assert.deepEqual(entries, timed);
  const days = monthDays(parseISO("2026-10-01"), entries);
  assert.equal(monthTotals(days).studyMinutes, 150);
  const rows = activityRows(days).filter((row) => row.date === "08/10/2026");
  assert.equal(
    rows.reduce((sum, row) => sum + row.hours, 0),
    9,
  );
  assert.deepEqual(
    rows.map((row) => [row.start, row.end, row.hours]),
    [
      ["9:00 AM", "10:30 AM", 1.5],
      ["10:30 AM", "11:30 AM", 1],
      ["11:30 AM", "6:00 PM", 6.5],
    ],
  );
  assert.match(rows[0].remark, /https:\/\/react.dev/);
});
test("manual totals export only remaining unassigned Study time", () => {
  const days = monthDays(parseISO("2026-10-01"), {
    "2026-10-08": {
      ...timed["2026-10-08"],
      studyMinutes: 240,
      timeMode: "manual",
    },
  });
  const rows = activityRows(days).filter((row) => row.date === "08/10/2026");
  assert.equal(rows.find((row) => row.activity === "Study")?.hours, 1.5);
  assert.equal(
    rows.reduce((sum, row) => sum + row.hours, 0),
    9,
  );
});
test("task time on holidays and planned days never contributes export hours", () => {
  for (const flags of [{ holiday: true }, { logged: false }]) {
    const rows = activityRows(
      monthDays(parseISO("2026-10-01"), {
        "2026-10-08": { ...timed["2026-10-08"], ...flags },
      }),
    ).filter((row) => row.date === "08/10/2026");
    assert.equal(
      rows.reduce((sum, row) => sum + row.hours, 0),
      0,
    );
  }
});
test("carry-forward copies only unfinished tasks without duplicating time or rewriting history", () => {
  const result = carryTasks(timed, "2026-10-08", "2026-10-09", [
    "react",
    "api",
  ]);
  assert.deepEqual(result["2026-10-08"], timed["2026-10-08"]);
  assert.equal(result["2026-10-09"].logged, false);
  assert.equal(result["2026-10-09"].studyMinutes, 0);
  assert.equal(result["2026-10-09"].tasks?.length, 1);
  assert.equal(result["2026-10-09"].tasks?.[0].minutes, 0);
  assert.equal(
    result["2026-10-09"].tasks?.[0].resourceUrl,
    "https://react.dev",
  );
  assert.throws(() =>
    carryTasks(result, "2026-10-08", "2026-10-09", ["react"]),
  );
  assert.throws(() => carryTasks(timed, "2026-10-08", "2026-10-08", ["react"]));
});
test("focus sessions are idempotent, preserve old manual time and reject overflow", () => {
  const next = addFocusMinutes(timed, "2026-10-08", "react", 25, "session-one");
  assert.equal(next["2026-10-08"].studyMinutes, 175);
  assert.equal(next["2026-10-08"].tasks?.[0].minutes, 115);
  assert.deepEqual(
    addFocusMinutes(next, "2026-10-08", "react", 25, "session-one"),
    next,
  );
  const manual = {
    "2026-10-08": {
      ...timed["2026-10-08"],
      timeMode: "manual" as const,
      studyMinutes: 240,
    },
  };
  assert.equal(
    addFocusMinutes(manual, "2026-10-08", "react", 25)["2026-10-08"]
      .studyMinutes,
    265,
  );
  assert.throws(() => addFocusMinutes(timed, "2026-10-08", "react", 400));
  assert.throws(() => addFocusMinutes(timed, "2026-10-08", "react", 0));
  assert.throws(() => addFocusMinutes(timed, "2026-10-08", "missing", 10));
  assert.throws(() =>
    addFocusMinutes(
      { "2026-10-08": { ...timed["2026-10-08"], holiday: true } },
      "2026-10-08",
      "react",
      10,
    ),
  );
});
test("restoring backups adds missing days and obeys explicit conflict preference", () => {
  const incoming = {
    "2026-10-08": { ...timed["2026-10-08"], remark: "Cloud" },
    "2026-10-09": { ...timed["2026-10-08"] },
  };
  assert.equal(mergeEntries(timed, incoming)["2026-10-08"].remark, "Practised");
  assert.equal(
    mergeEntries(timed, incoming, "incoming")["2026-10-08"].remark,
    "Cloud",
  );
  assert.ok(mergeEntries(timed, incoming)["2026-10-09"]);
});
test("cloud sync preserves local deletions during upload and keeps remote-only dates", () => {
  const synced: Entries = {
    ...timed,
    "2026-10-09": timed["2026-10-08"],
  };
  const result = mergeCloudResult(timed, synced, {});
  assert.equal(result["2026-10-08"], undefined);
  assert.deepEqual(result["2026-10-09"], synced["2026-10-09"]);
  assert.ok(synced["2026-10-08"], "does not mutate the uploaded snapshot");
});

test("cloud sync preserves pending edits and additions but applies reviewed conflicts", () => {
  const baseline = { ...timed, "2026-10-09": timed["2026-10-08"] };
  const synced = {
    ...baseline,
    "2026-10-08": { ...timed["2026-10-08"], remark: "Cloud choice" },
    "2026-10-09": { ...timed["2026-10-08"], remark: "Cloud choice" },
  };
  const latest = {
    ...baseline,
    "2026-10-08": { ...timed["2026-10-08"], remark: "Pending edit" },
    "2026-10-10": { ...timed["2026-10-08"], remark: "New day" },
  };
  const result = mergeCloudResult(baseline, synced, latest);
  assert.equal(result["2026-10-08"].remark, "Pending edit");
  assert.equal(result["2026-10-09"].remark, "Cloud choice");
  assert.equal(result["2026-10-10"].remark, "New day");
});

test("weekly learning respects Monday boundaries, holidays and year transitions", () => {
  const entries = {
    ...timed,
    "2026-10-04": timed["2026-10-08"],
    "2026-10-11": { ...timed["2026-10-08"], holiday: true },
  };
  const week = weekLearning(entries, parseISO("2026-10-08"));
  assert.equal(week[0].key, "2026-10-05");
  assert.equal(
    week.reduce((sum, day) => sum + day.minutes, 0),
    150,
  );
  assert.equal(weekLearning({}, parseISO("2027-01-01"))[0].key, "2026-12-28");
});
test("streaks skip holidays but stop at unlogged working days", () => {
  const entry = timed["2026-10-08"];
  assert.equal(
    learningStreak(
      { "2026-10-10": entry, "2026-10-12": entry },
      parseISO("2026-10-12"),
    ),
    2,
  );
  assert.equal(
    learningStreak(
      { "2026-10-10": entry, "2026-10-12": entry },
      parseISO("2026-10-13"),
    ),
    2,
  );
});
test("timer elapsed time survives suspension and pause without accumulating tick drift", () => {
  assert.equal(elapsedSeconds({ seconds: 30, startedAt: 100000 }, 160999), 90);
  assert.equal(elapsedSeconds({ seconds: 90, startedAt: null }, 900000), 90);
  assert.equal(elapsedSeconds({ seconds: 0, startedAt: 200000 }, 100000), 0);
  assert.equal(elapsedSeconds({ seconds: 90, startedAt: 200000 }, 100000), 90);
});

test("focus time includes minutes already entered on a planned manual day", () => {
  const planned: Entries = {
    "2026-10-08": {
      ...timed["2026-10-08"],
      logged: false,
      timeMode: "manual",
      studyMinutes: 0,
    },
  };
  const saved = addFocusMinutes(planned, "2026-10-08", "react", 25);
  assert.equal(saved["2026-10-08"].studyMinutes, 175);
  assert.equal(saved["2026-10-08"].logged, true);
});
test("distinct tasks with the same title can both carry forward", () => {
  const source: Entries = {
    "2026-10-08": {
      studyMinutes: 0,
      remark: "",
      logged: false,
      tasks: [
        { id: "one", title: "Practice", notes: "React", status: "todo" },
        { id: "two", title: "Practice", notes: "Python", status: "todo" },
      ],
    },
  };
  const first = carryTasks(source, "2026-10-08", "2026-10-09", ["one"]);
  const second = carryTasks(first, "2026-10-08", "2026-10-09", ["two"]);
  assert.equal(second["2026-10-09"].tasks?.length, 2);
});
test("unsafe URLs, invalid dates, excess time and inconsistent task totals are rejected", () => {
  for (const patch of [
    { resourceUrl: "javascript:alert(1)" },
    { dueDate: "2026-02-30" },
    { minutes: -1 },
    { minutes: 1.25 },
    { tags: [""] },
    { priority: "urgent" },
  ]) {
    const entry = timed["2026-10-08"];
    assert.throws(() =>
      decodeEntries(
        JSON.stringify({
          version: 1,
          entries: {
            "2026-10-08": {
              ...entry,
              tasks: [{ ...entry.tasks![0], ...patch }, entry.tasks![1]],
            },
          },
        }),
      ),
    );
  }
  assert.throws(() =>
    decodeEntries(
      encodeEntries({
        "2026-10-08": { ...timed["2026-10-08"], studyMinutes: 10 },
      }),
    ),
  );
});
