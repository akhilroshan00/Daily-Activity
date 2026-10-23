import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildSimpleDay } from "../src/lib/simple-day";
import {
  dayTimeTotals,
  withLunch,
  effectiveTimeLog,
  type TimeLog,
} from "../src/lib/time-log";
import { monthDays, activityRows } from "../src/lib/activity";
import { parseISO } from "date-fns";

test("crossing activities exclude lunch, group batches and free time once, and normalize idempotently", () => {
  const log: TimeLog = {
    miscAdjustment: 0,
    extraFreeMinutes: 0,
    blocks: [
      {
        id: "batch",
        start: "09:00",
        end: "12:00",
        category: "teaching",
        topic: "Batch",
      },
      {
        id: "learn",
        start: "12:00",
        end: "15:00",
        category: "studying",
        topic: "React",
      },
      {
        id: "free",
        start: "15:00",
        end: "16:00",
        category: "free",
        topic: "Free time",
      },
      {
        id: "meeting",
        start: "16:00",
        end: "18:00",
        category: "studying",
        topic: "Meeting",
      },
    ],
  };
  const original = JSON.stringify(log);
  const saved = buildSimpleDay("2026-10-12", undefined, log, "working", "");
  assert.equal(saved.studyMinutes, 360);
  assert.deepEqual(dayTimeTotals(saved), {
    study: 360,
    misc: 120,
    teaching: 180,
    free: 60,
    breaks: 60,
    work: 480,
    logged: 540,
  });
  assert.equal(JSON.stringify(log), original);
  assert.deepEqual(withLunch(saved.timeLog!), saved.timeLog);
  const rows = activityRows(
    monthDays(parseISO("2026-10-12"), { "2026-10-12": saved }),
  ).filter((row) => row.date === "12/10/2026");
  assert.equal(
    rows.reduce((sum, row) => sum + row.hours, 0),
    9,
  );
});

test("previous spreadsheet rows retain their source ranges but exclude lunch and classify meetings in reports", () => {
  const entry = {
    studyMinutes: 180,
    logged: true,
    remark: "Original",
    tasks: [
      {
        id: "xlsx:Sheet:1",
        title: "Learning",
        status: "completed" as const,
        notes: "Original HRS: 3.5",
        minutes: 150,
        fromTime: "12:00",
        toTime: "14:30",
      },
      {
        id: "xlsx:Sheet:2",
        title: "Huddle meeting",
        status: "completed" as const,
        notes: "",
        minutes: 30,
        fromTime: "16:30",
        toTime: "17:00",
      },
    ],
  };
  const before = JSON.stringify(entry);
  assert.deepEqual(dayTimeTotals(entry), {
    study: 90,
    misc: 30,
    teaching: 0,
    free: 0,
    breaks: 60,
    work: 120,
    logged: 180,
  });
  assert.equal(effectiveTimeLog(entry).blocks.length, 3);
  assert.equal(JSON.stringify(entry), before);
});

test("lunch-only activity is excluded from learning and overlapping work is still rejected", () => {
  const log: TimeLog = {
    miscAdjustment: 0,
    extraFreeMinutes: 0,
    blocks: [
      {
        id: "lunch-work",
        start: "13:30",
        end: "14:30",
        category: "misc",
        topic: "",
      },
    ],
  };
  const saved = buildSimpleDay("2026-10-12", undefined, log, "working", "");
  assert.equal(saved.studyMinutes, 0);
  assert.equal(saved.logged, false);
  assert.equal(dayTimeTotals(saved).logged, 0);
  assert.throws(
    () =>
      buildSimpleDay(
        "2026-10-12",
        undefined,
        {
          ...log,
          blocks: [
            {
              id: "a",
              start: "12:00",
              end: "15:00",
              category: "studying",
              topic: "",
            },
            {
              id: "b",
              start: "14:30",
              end: "16:00",
              category: "free",
              topic: "",
            },
          ],
        },
        "working",
        "",
      ),
    /overlap/,
  );
});
