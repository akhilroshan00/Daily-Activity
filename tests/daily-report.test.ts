import test from "node:test";
import assert from "node:assert/strict";
import {
  clockParts,
  clockValue,
  formatClock,
  formatTimestamp,
} from "../src/lib/clock";
import {
  dailyReportContext,
  readReportStore,
  reportClock,
  reportReminderDue,
  nextReportCheck,
  reportSource,
  emptyReport,
  hasReportEntry,
} from "../src/lib/daily-report";
import type { DayEntry } from "../src/lib/activity";

const day = "2026-10-24";
const entry: DayEntry = {
  logged: true,
  holiday: false,
  studyMinutes: 120,
  remark: "Privilege escalation not completed.",
  timeMode: "activities",
  timeLog: {
    blocks: [
      {
        id: "a",
        start: "12:30",
        end: "13:30",
        topic: "Pawn Lab presentation",
        category: "studying",
      },
      {
        id: "b",
        start: "14:30",
        end: "15:30",
        topic: "Privilege escalation (not completed)",
        category: "studying",
      },
    ],
    miscAdjustment: 0,
    extraFreeMinutes: 0,
  },
  tasks: [
    {
      id: "old",
      title: "Historical task",
      status: "blocked",
      notes: "Blocked by setup",
    },
  ],
};

test("12-hour time inputs preserve midnight, noon and every minute exactly", () => {
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m++) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const parts = clockParts(value);
      assert.equal(clockValue(parts.hour, parts.minute, parts.period), value);
    }
  assert.equal(formatClock("00:00"), "12:00 AM");
  assert.equal(formatClock("12:00"), "12:00 PM");
  assert.equal(formatClock("17:00"), "5:00 PM");
  assert.equal(formatClock(""), "");
  assert.throws(() => clockValue("13", "00", "AM"));
  assert.throws(() => clockValue("1", "60", "PM"));
  assert.match(
    formatTimestamp("2026-10-24T11:30:00Z", "Asia/Kolkata"),
    /5:00\s*pm/i,
  );
});

test("report data keeps the selected date, explicit incomplete notes and shared totals", () => {
  const context = dailyReportContext(day, entry);
  assert.equal(context.date, "24 October 2026");
  assert.match(context.notes, /not completed/);
  assert.equal(context.timeTotals.study, "2h");
  assert.equal(context.timeTotals.work, "8h");
  assert.equal(context.timeTotals.logged, "9h");
  assert.equal(
    context.activities.find((item) => item.topic.includes("Privilege"))?.start,
    "2:30 PM",
  );
  assert.equal(context.historicalTasks[0].status, "Blocked");
  assert.deepEqual(context.recordedTasks, []);
  assert.match(
    context.activities.find((item) => item.topic === "Miscellaneous")!.source,
    /Automatically allocated gap/,
  );
  assert.equal(
    context.activities.some((item) => item.topic === "Historical task"),
    false,
  );
});

test("legacy tasks remain usable report facts with their actual statuses", () => {
  const context = dailyReportContext(day, {
    ...entry,
    timeMode: "tasks",
    timeLog: undefined,
  });
  assert.equal(context.recordedTasks[0].status, "Blocked");
  assert.deepEqual(context.historicalTasks, []);
});

test("leave and holidays do not report preserved activities as work", () => {
  for (const status of [{ leave: true }, { holiday: true }]) {
    const context = dailyReportContext(day, { ...entry, ...status });
    assert.equal(context.logged, false);
    assert.deepEqual(context.activities, []);
    assert.equal(context.timeTotals.work, "0h");
    assert.equal(context.notes, entry.remark);
  }
});

test("empty days cannot trigger generation, but notes-only entries can", () => {
  assert.equal(hasReportEntry(undefined), false);
  assert.equal(
    hasReportEntry({ studyMinutes: 0, logged: false, remark: "" }),
    false,
  );
  assert.equal(
    hasReportEntry({
      studyMinutes: 0,
      logged: false,
      remark: "Updated presentation",
    }),
    true,
  );
  assert.throws(() => dailyReportContext("2026-02-30", entry));
});

test("report cache changes with facts or template, not a save timestamp", () => {
  const source = reportSource(day, entry, "Template");
  assert.equal(
    reportSource(
      day,
      { ...entry, updatedAt: new Date().toISOString() },
      "Template",
    ),
    source,
  );
  assert.notEqual(
    reportSource(day, { ...entry, remark: "New notes" }, "Template"),
    source,
  );
  assert.notEqual(reportSource(day, entry, "New template"), source);
});

test("5 PM reminder uses IST independently of the device timezone", () => {
  const before = new Date("2026-10-24T11:29:59.999Z");
  const at = new Date("2026-10-24T11:30:00.000Z");
  assert.deepEqual(reportClock(at), { date: day, minutes: 1020 });
  assert.equal(reportReminderDue(before), false);
  assert.equal(nextReportCheck(before), 1);
  assert.equal(reportReminderDue(at), true);
  assert.equal(reportReminderDue(new Date("2026-10-24T14:00:00Z")), true);
  assert.equal(
    reportClock(new Date("2026-10-24T18:30:00Z")).date,
    "2026-10-25",
  );
});

test("confirmation, dismissal and snooze control reminder delivery separately", () => {
  const now = new Date("2026-10-24T11:30:00Z");
  const remindedAt = now.toISOString();
  assert.equal(
    reportReminderDue(now, { ...emptyReport(), sentAt: remindedAt }),
    false,
  );
  assert.equal(reportReminderDue(now, { ...emptyReport(), remindedAt }), false);
  const snoozed = {
    ...emptyReport(),
    remindedAt,
    snoozedUntil: "2026-10-24T11:40:00Z",
  };
  assert.equal(reportReminderDue(now, snoozed), false);
  assert.equal(nextReportCheck(now, snoozed), 600000);
  assert.equal(
    reportReminderDue(new Date(snoozed.snoozedUntil), snoozed),
    true,
  );
  assert.equal(
    reportReminderDue(new Date(snoozed.snoozedUntil), {
      ...snoozed,
      sentAt: remindedAt,
    }),
    false,
  );
  // Generating a draft is not confirmation of sending.
  assert.equal(
    reportReminderDue(now, {
      ...emptyReport(),
      text: "Generated draft",
      generatedAt: remindedAt,
    }),
    true,
  );
});

test("report persistence rejects corrupt data rather than overwriting it", () => {
  const store = readReportStore(null);
  store.reports[day] = {
    ...emptyReport(),
    text: "Draft",
    generatedAt: "2026-10-24T11:00:00Z",
  };
  assert.deepEqual(readReportStore(JSON.stringify(store)), store);
  assert.throws(() => readReportStore("{broken"));
  assert.throws(() =>
    readReportStore(JSON.stringify({ ...store, version: 2 })),
  );
  assert.throws(() =>
    readReportStore(
      JSON.stringify({ ...store, reports: { "2026-02-30": emptyReport() } }),
    ),
  );
  assert.throws(() =>
    readReportStore(
      JSON.stringify({
        ...store,
        reports: { [day]: { ...emptyReport(), sentAt: "not a date" } },
      }),
    ),
  );
});
