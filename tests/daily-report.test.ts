import test from "node:test";
import assert from "node:assert/strict";
import {
  clockParts,
  clockValue,
  formatClock,
  formatTimestamp,
  parseClockInput,
  clockFace,
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
  editReportText,
  canReplaceReport,
  ReportConflictError,
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

test("simple time typing accepts familiar and quick numeric inputs without guessing 24-hour time", () => {
  for (const text of ["9", "09", "9:00", "900", "0900", "9.00", "9 AM"])
    assert.equal(parseClockInput(text), "09:00", text);
  assert.equal(parseClockInput("930", "PM"), "21:30");
  assert.equal(parseClockInput(" 9:30 pm "), "21:30");
  assert.equal(parseClockInput("1230", "AM"), "00:30");
  assert.equal(parseClockInput("12pm"), "12:00");
  assert.equal(parseClockInput(""), "");
  for (const text of [
    "17:00",
    "0:30",
    "9:60",
    "1260",
    "9:3",
    "10000",
    "hello",
    "1:00 tonight",
  ])
    assert.equal(parseClockInput(text), undefined, text);
  for (let minute = 0; minute < 1440; minute++) {
    const value = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const period = minute < 720 ? "AM" : "PM";
    assert.equal(parseClockInput(clockFace(value), period), value);
  }
});

test("editing a sent report preserves history, clears sending confirmation and protects another tab's text", () => {
  const store = readReportStore(null);
  const stamp = "2026-10-24T11:00:00Z";
  store.reports[day] = {
    text: "Original report",
    source: "source",
    generatedAt: stamp,
    sentAt: stamp,
    style: "explained",
  };
  const updated = editReportText(
    store,
    day,
    "My revised report",
    "Original report",
    "new-source",
    stamp,
  );
  assert.equal(updated.reports[day].text, "My revised report");
  assert.equal(updated.reports[day].source, "source");
  assert.equal(updated.reports[day].style, "explained");
  assert.equal(updated.reports[day].generatedAt, stamp);
  assert.equal(updated.reports[day].editedAt, stamp);
  assert.equal(updated.reports[day].sentAt, undefined);
  assert.equal(store.reports[day].text, "Original report");
  assert.equal(
    editReportText(
      store,
      day,
      "Original report",
      "Original report",
      "source",
      stamp,
    ),
    store,
  );
  assert.throws(
    () =>
      editReportText(
        updated,
        day,
        "A stale edit",
        "Original report",
        "source",
        stamp,
      ),
    ReportConflictError,
  );
  assert.throws(() =>
    editReportText(
      store,
      day,
      "x".repeat(16001),
      "Original report",
      "source",
      stamp,
    ),
  );
  assert.equal(
    readReportStore(JSON.stringify(updated)).reports[day].editedAt,
    stamp,
  );
});

test("AI replies cannot overwrite a newer edit, deletion or sending confirmation", () => {
  const previous = { text: "Draft", source: "source" };
  assert.equal(canReplaceReport(undefined, undefined), true);
  assert.equal(
    canReplaceReport(
      { ...emptyReport(), remindedAt: "2026-10-24T11:30:00Z" },
      undefined,
    ),
    true,
  );
  assert.equal(canReplaceReport({ ...previous }, previous), true);
  assert.equal(
    canReplaceReport({ ...previous, text: "Newer draft" }, previous),
    false,
  );
  assert.equal(
    canReplaceReport(
      { ...previous, editedAt: "2026-10-24T11:00:00Z" },
      previous,
    ),
    false,
  );
  assert.equal(
    canReplaceReport({ ...previous, sentAt: "2026-10-24T11:00:00Z" }, previous),
    false,
  );
  assert.equal(canReplaceReport(undefined, previous), false);
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
