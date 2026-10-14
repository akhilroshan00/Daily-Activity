import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import { test } from "node:test";
import { parseISO } from "date-fns";
import {
  decodeEntries,
  encodeEntries,
  monthDays,
  monthTotals,
  activityRows,
  type DayEntry,
} from "../src/lib/activity";
import { buildDailyEntry } from "../src/lib/day-editor";
import { buildGoogleBackup, buildGoogleTables } from "../src/lib/google-data";
import { addFocusMinutes } from "../src/lib/learning";
import { mergeActivityImport } from "../src/lib/activity-import-merge";
import { parseActivityWorkbook } from "../src/lib/activity-import";
import { buildActivityWorkbook } from "../src/lib/exports";
import {
  dayTimeTotals,
  learningTopics,
  scheduleTemplate,
  splitLearningBlock,
  validateTimeLog,
  reconcileDayMiscellaneous,
  reconcileAllEntries,
  effectiveTimeLog,
  timeLogTotals,
  type TimeLog,
} from "../src/lib/time-log";

const date = "2026-10-12";
test("exported Excel restores original activities and retained leave time without recreating tasks or double counting", async () => {
  const records = {
    [date]: entry(),
    "2026-10-13": { ...entry(), leave: true, holiday: true },
  };
  const days = monthDays(parseISO(date), records);
  const workbook = await buildActivityWorkbook(
    parseISO(date),
    days,
    "month",
    records,
  );
  assert.ok(workbook.Sheets["Daily totals"]);
  assert.ok(workbook.Sheets["Learning topics"]);
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const restored = parseActivityWorkbook(bytes).entries;
  assert.deepEqual(restored, records);
  const merged = mergeActivityImport(records, restored);
  assert.deepEqual(merged, records);
});
function schedule(): TimeLog {
  return {
    blocks: scheduleTemplate(parseISO(date)),
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  };
}
function entry(log = schedule()): DayEntry {
  return buildDailyEntry(
    date,
    {
      studyMinutes: 0,
      logged: false,
      remark: "Keep my notes",
      timeLog: log,
      importantTask: "Finish course",
    },
    [],
    "1.5",
    false,
    "tasks",
  );
}
test("weekday schedule separates lunch, huddle, batches and free time and reconciles exports and Google", () => {
  const saved = entry();
  assert.deepEqual(dayTimeTotals(saved), {
    study: 460,
    misc: 20,
    teaching: 360,
    breaks: 60,
    free: 10,
    work: 540,
    logged: 540,
  });
  const days = monthDays(parseISO(date), { [date]: saved });
  const totals = monthTotals(days);
  assert.equal(totals.breakMinutes, 60);
  assert.equal(totals.freeMinutes, 10);
  assert.equal(totals.teachingMinutes, 360);
  const rows = activityRows(days).filter((row) => row.date === "12/10/2026");
  assert.equal(
    Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 60),
    540,
  );
  assert.ok(
    rows.some(
      (row) =>
        row.activity === "Break / lunch" &&
        row.start === "1:30 PM" &&
        row.end === "2:30 PM",
    ),
  );
  const table = buildGoogleTables({ [date]: saved }).days[1];
  assert.deepEqual(table.slice(7, 12), [360, 60, 10, 540, 540]);
  assert.deepEqual(decodeEntries(buildGoogleBackup({ [date]: saved })), {
    [date]: saved,
  });
});
test("no batch can split into learning and free time without overlaps or lost minutes", () => {
  const log = schedule();
  log.blocks.splice(2, 1, ...splitLearningBlock(log.blocks[2], 45));
  const saved = entry(log);
  assert.equal(saved.studyMinutes, 135);
  assert.equal(dayTimeTotals(saved).free, 85);
  assert.equal(dayTimeTotals(saved).logged, 540);
  validateTimeLog(log);
  log.blocks.splice(2, 1, ...splitLearningBlock(log.blocks[2], 20));
  validateTimeLog(log);
  assert.equal(dayTimeTotals(entry(log)).logged, 540);
});
test("weekend schedule leaves open periods for custom activities and Sunday can be worked", () => {
  const log = {
    blocks: scheduleTemplate(parseISO("2026-10-11")),
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  };
  assert.equal(log.blocks.length, 3);
  log.blocks.push({
    id: "weekend",
    start: "10:00",
    end: "11:00",
    category: "studying",
    topic: "Python",
  });
  const saved = buildDailyEntry(
    "2026-10-11",
    { studyMinutes: 0, logged: false, remark: "", timeLog: log },
    [],
    "1",
    false,
    "tasks",
  );
  const day = monthDays(parseISO(date), { "2026-10-11": saved }).find(
    (day) => day.key === "2026-10-11",
  )!;
  assert.equal(day.holiday, false);
  assert.equal(day.studyMinutes, 60);
  assert.equal(dayTimeTotals(saved).logged, 150);
});
test("manual adjustments move learning to misc and add free time without duplicating totals", () => {
  const saved = entry({
    ...schedule(),
    miscAdjustment: 30,
    extraFreeMinutes: 15,
  });
  assert.equal(saved.studyMinutes, 60);
  assert.equal(dayTimeTotals(saved).misc, 50);
  assert.equal(dayTimeTotals(saved).logged, 555);
  const rows = activityRows(
    monthDays(parseISO(date), { [date]: saved }),
  ).filter((row) => row.date === "12/10/2026");
  assert.equal(
    Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 60),
    555,
  );
});
test("legacy data retains its totals and importing tasks retains schedule, notes and important task", () => {
  const legacy = { studyMinutes: 240, remark: "History", logged: true };
  assert.deepEqual(decodeEntries(encodeEntries({ [date]: legacy })), {
    [date]: legacy,
  });
  assert.equal(dayTimeTotals(legacy).misc, 240);
  const saved = entry();
  const incoming = {
    ...legacy,
    tasks: [
      {
        id: "xlsx:sheet:1",
        title: "Course",
        notes: "",
        status: "completed" as const,
        minutes: 30,
      },
    ],
  };
  const merged = mergeActivityImport({ [date]: saved }, { [date]: incoming })[
    date
  ];
  assert.deepEqual(merged.timeLog, saved.timeLog);
  assert.equal(merged.importantTask, "Finish course");
  assert.equal(merged.remark, "Keep my notes");
  assert.equal(merged.studyMinutes, 90);
});
test("focus/task learning is included once in schedule learning and topic totals", () => {
  const saved = {
    ...entry(),
    tasks: [
      {
        id: "task",
        title: "Course",
        notes: "",
        status: "todo" as const,
        subject: "React",
        minutes: 30,
      },
    ],
  };
  const focused = addFocusMinutes(
    { [date]: saved },
    date,
    "task",
    30,
    "session",
  )[date];
  assert.equal(focused.studyMinutes, 90);
  assert.equal(focused.tasks?.[0].minutes, 60);
  assert.equal(
    learningTopics(focused).reduce((sum, topic) => sum + topic.minutes, 0),
    460,
  );
  const rows = activityRows(
    monthDays(parseISO(date), { [date]: focused }),
  ).filter((row) => row.date === "12/10/2026");
  assert.equal(
    Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 60),
    540,
  );
});
test("leave hides totals while preserving activities for return to a working day", () => {
  const saved = entry();
  const leave = buildDailyEntry(
    date,
    { ...saved, leave: true },
    [],
    "1.5",
    true,
    "tasks",
  );
  const days = monthDays(parseISO(date), { [date]: leave });
  assert.equal(monthTotals(days).studyMinutes, 0);
  assert.equal(monthTotals(days).breakMinutes, 0);
  assert.ok(activityRows(days).some((row) => row.activity === "Leave"));
  const restored = buildDailyEntry(
    date,
    { ...leave, leave: false },
    [],
    "1.5",
    false,
    "tasks",
  );
  assert.deepEqual(restored.timeLog, saved.timeLog);
  assert.equal(dayTimeTotals(restored).logged, 540);
});
test("invalid overlap, backward times, excessive adjustment, duplicate ids and overfull days fail safely", () => {
  const bad = schedule();
  bad.blocks[1].start = "09:05";
  assert.throws(() => validateTimeLog(bad), /overlap/);
  const reversed = schedule();
  reversed.blocks[0].end = "08:59";
  assert.throws(() => validateTimeLog(reversed));
  assert.throws(() => validateTimeLog({ ...schedule(), miscAdjustment: 91 }));
  assert.throws(() =>
    validateTimeLog({ ...schedule(), extraFreeMinutes: 1440 }),
  );
  const duplicate = schedule();
  duplicate.blocks[1].id = duplicate.blocks[0].id;
  assert.throws(() => validateTimeLog(duplicate));
  assert.throws(() => splitLearningBlock(schedule().blocks[2], 121));
  assert.throws(() => splitLearningBlock(schedule().blocks[2], -1));
  assert.throws(() => entry({ ...schedule(), miscAdjustment: 1.5 }));
});
test("reconcileDayMiscellaneous calculates and sets miscellaneous for existing logs", () => {
  const existing: DayEntry = {
    studyMinutes: 120,
    remark: "History",
    logged: true,
    timeLog: {
      blocks: [
        {
          id: "batch",
          start: "09:30",
          end: "11:30",
          category: "teaching",
          topic: "Morning batch",
        },
      ],
      miscAdjustment: 0,
      extraFreeMinutes: 0,
    },
  };
  const reconciled = reconcileDayMiscellaneous(existing);
  assert.equal(reconciled.studyMinutes, 120);
  assert.equal(reconciled.timeMode, "activities");
  assert.ok(reconciled.timeLog);
  assert.ok(reconciled.timeLog.blocks.some((b) => b.category === "misc"));
  assert.equal(dayTimeTotals(reconciled).misc, 360);
  assert.equal(dayTimeTotals(reconciled).work, 540);
  assert.equal(dayTimeTotals(reconciled).logged, 540);

  const batch = {
    "2026-10-12": existing,
    "2026-10-13": { studyMinutes: 0, remark: "Weekend", logged: false },
  };
  const all = reconcileAllEntries(batch);
  assert.equal(all.updatedCount, 1);
  assert.equal(dayTimeTotals(all.entries["2026-10-12"]).misc, 360);
  assert.equal(all.entries["2026-10-13"].logged, false);
});
test("all unassigned workday time goes to miscellaneous dynamically", () => {
  const threeHours = effectiveTimeLog({
    studyMinutes: 180,
    remark: "",
    logged: true,
    timeLog: {
      blocks: [
        {
          id: "study-3h",
          start: "10:00",
          end: "13:00",
          category: "studying",
          topic: "Learning",
        },
      ],
      miscAdjustment: 0,
      extraFreeMinutes: 0,
    },
  });
  const t3 = timeLogTotals(threeHours);
  assert.equal(t3.studying, 180);
  assert.equal(t3.break, 60);
  assert.equal(t3.misc, 300);

  const fourHours = effectiveTimeLog({
    studyMinutes: 240,
    remark: "",
    logged: true,
    timeLog: {
      blocks: [
        {
          id: "study-4h",
          start: "09:00",
          end: "13:00",
          category: "studying",
          topic: "Learning",
        },
      ],
      miscAdjustment: 0,
      extraFreeMinutes: 0,
    },
  });
  const t4 = timeLogTotals(fourHours);
  assert.equal(t4.studying, 240);
  assert.equal(t4.break, 60);
  assert.equal(t4.misc, 240);
});
