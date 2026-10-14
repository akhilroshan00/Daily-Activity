import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseISO } from "date-fns";
import { buildSimpleDay, legacyActivityLog } from "../src/lib/simple-day";
import {
  dayTimeTotals,
  learningTopics,
  scheduleTemplate,
} from "../src/lib/time-log";
import {
  activityRows,
  decodeEntries,
  encodeEntries,
  monthDays,
  type DayEntry,
} from "../src/lib/activity";
import { mergeActivityImport } from "../src/lib/activity-import-merge";
import { buildGoogleTables } from "../src/lib/google-data";
import { addFocusMinutes } from "../src/lib/learning";

const date = "2026-10-12";
const task = {
  id: "old-task",
  title: "Imported study",
  notes: "Original HRS: 3.5",
  status: "completed" as const,
  minutes: 240,
  fromTime: "09:00",
  toTime: "13:00",
};
const previous: DayEntry = {
  studyMinutes: 240,
  remark: "Saved",
  logged: true,
  tasks: [task],
  timeMode: "tasks",
  focusSessions: ["receipt"],
};
test("editing legacy notes and day type keeps hours, task history and receipts unchanged", () => {
  const saved = buildSimpleDay(
    date,
    previous,
    undefined,
    "working",
    "New notes",
  );
  assert.equal(saved.studyMinutes, 240);
  assert.equal(saved.timeMode, "tasks");
  assert.deepEqual(saved.tasks, previous.tasks);
  assert.deepEqual(saved.focusSessions, previous.focusSessions);
  const off = buildSimpleDay(date, saved, undefined, "leave", "New notes");
  const day = monthDays(parseISO(date), { [date]: off }).find(
    (day) => day.key === date,
  )!;
  assert.equal(day.studyMinutes, 0);
  assert.equal(day.miscMinutes, 0);
  assert.equal(
    buildSimpleDay(date, off, undefined, "working", "New notes").studyMinutes,
    240,
  );
});
test("explicit legacy conversion preserves exact spreadsheet ranges and all original totals", () => {
  const log = legacyActivityLog(previous);
  assert.ok(
    log.blocks.some(
      (block) =>
        block.start === "09:00" &&
        block.end === "13:00" &&
        block.topic === task.title,
    ),
  );
  const saved = buildSimpleDay(date, previous, log, "working", previous.remark);
  assert.equal(saved.timeMode, "activities");
  assert.equal(saved.studyMinutes, 240);
  assert.equal(dayTimeTotals(saved).logged, 540);
  assert.deepEqual(saved.tasks, previous.tasks);
});
test("legacy allocations without usable time ranges keep their nine-hour total on conversion", () => {
  for (const studyMinutes of [0, 1, 240, 540]) {
    const old = { studyMinutes, logged: true, remark: "" };
    const saved = buildSimpleDay(
      date,
      old,
      legacyActivityLog(old),
      "working",
      "",
    );
    assert.equal(
      saved.studyMinutes,
      studyMinutes - Math.max(0, Math.min(60, studyMinutes - 270)),
    );
    assert.equal(dayTimeTotals(saved).logged, 540);
  }
});
test("activity edits determine learning and allocate remaining workday time to miscellaneous", () => {
  const log = {
    blocks: [
      {
        id: "one",
        start: "10:00",
        end: "11:00",
        category: "studying" as const,
        topic: "React",
      },
      {
        id: "lunch",
        start: "13:30",
        end: "14:30",
        category: "break" as const,
        topic: "Lunch",
      },
    ],
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  };
  const saved = buildSimpleDay(date, previous, log, "working", previous.remark);
  assert.equal(saved.studyMinutes, 60);
  assert.equal(dayTimeTotals(saved).misc, 420);
  assert.equal(dayTimeTotals(saved).work, 540);
  assert.equal(dayTimeTotals(saved).logged, 540);
  assert.deepEqual(saved.tasks, previous.tasks);
  assert.deepEqual(decodeEntries(encodeEntries({ [date]: saved })), {
    [date]: saved,
  });
  assert.deepEqual(learningTopics(saved), [{ topic: "React", minutes: 60 }]);
  assert.equal(buildGoogleTables({ [date]: saved }).tasks[1][5], 0);
  const rows = activityRows(
    monthDays(parseISO(date), { [date]: saved }),
  ).filter((row) => row.date === "12/10/2026");
  assert.equal(
    rows.reduce((sum, row) => sum + row.hours, 0),
    9,
  );
});
test("free time counts as learning and removing activities leaves a pending day", () => {
  const log = {
    blocks: [
      {
        id: "free",
        start: "09:00",
        end: "13:00",
        category: "free" as const,
        topic: "",
      },
    ],
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  };
  const saved = buildSimpleDay(date, previous, log, "working", "");
  assert.equal(saved.studyMinutes, 240);
  assert.equal(dayTimeTotals(saved).logged, 540);
  const empty = buildSimpleDay(
    date,
    saved,
    { ...log, blocks: [] },
    "working",
    "",
  );
  assert.equal(empty.logged, false);
  assert.equal(empty.studyMinutes, 0);
  assert.equal(dayTimeTotals(empty).logged, 0);
  assert.deepEqual(empty.tasks, previous.tasks);
});
test("a new notes-only day stays unlogged rather than counting a phantom nine hours", () => {
  const saved = buildSimpleDay(date, undefined, undefined, "working", "A note");
  assert.equal(saved.logged, false);
  assert.equal(
    monthDays(parseISO(date), { [date]: saved }).find((day) => day.key === date)
      ?.miscMinutes,
    0,
  );
});
test("unchanged older schedules retain their saved hours until an activity edit is made", () => {
  const old = {
    ...previous,
    timeLog: {
      blocks: scheduleTemplate(parseISO(date)),
      miscAdjustment: 0,
      extraFreeMinutes: 0,
    },
  };
  const saved = buildSimpleDay(date, old, old.timeLog, "working", "Note");
  assert.equal(saved.studyMinutes, 240);
  assert.equal(saved.timeMode, "tasks");
  const changed = buildSimpleDay(
    date,
    saved,
    {
      ...old.timeLog,
      blocks: old.timeLog.blocks.map((block) => ({ ...block })),
    },
    "working",
    "Note",
  );
  assert.equal(changed.studyMinutes, 460);
});
test("later imports and focus sessions cannot change activity totals through archived tasks", () => {
  const log = {
    blocks: [
      {
        id: "one",
        start: "10:00",
        end: "11:00",
        category: "studying" as const,
        topic: "React",
      },
    ],
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  };
  const saved = buildSimpleDay(date, previous, log, "working", "");
  const incoming = {
    ...previous,
    tasks: [{ ...task, id: "new-import", minutes: 30 }],
  };
  const merged = mergeActivityImport({ [date]: saved }, { [date]: incoming })[
    date
  ];
  assert.equal(merged.studyMinutes, 60);
  assert.equal(merged.tasks?.length, 2);
  assert.throws(
    () => addFocusMinutes({ [date]: saved }, date, task.id, 10, "another"),
    /activity times/,
  );
});
test("overlap and backwards time are rejected without mutating existing history", () => {
  const before = JSON.stringify(previous);
  const blocks = [
    {
      id: "a",
      start: "10:00",
      end: "11:00",
      category: "studying" as const,
      topic: "",
    },
    {
      id: "b",
      start: "10:30",
      end: "12:00",
      category: "free" as const,
      topic: "",
    },
  ];
  assert.throws(
    () =>
      buildSimpleDay(
        date,
        previous,
        { blocks, miscAdjustment: 0, extraFreeMinutes: 0 },
        "working",
        "",
      ),
    /overlap/,
  );
  assert.equal(JSON.stringify(previous), before);
});
