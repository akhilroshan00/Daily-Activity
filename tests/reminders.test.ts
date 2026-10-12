import test from "node:test";
import assert from "node:assert/strict";
import {
  reminderOccurrence,
  validReminder,
  type Reminder,
} from "../src/lib/reminders";
import { chatContext } from "../src/lib/chat-context";
const base: Reminder = {
  id: "r",
  title: "Study",
  date: "2026-01-31",
  time: "13:30",
  repeat: "monthly",
  enabled: true,
};
test("monthly reminders clamp month end and return to original day", () => {
  assert.equal(
    reminderOccurrence(base, new Date(2026, 1, 28, 13, 30)),
    "2026-02-28T13:30",
  );
  assert.equal(
    reminderOccurrence(base, new Date(2026, 2, 31, 13, 30)),
    "2026-03-31T13:30",
  );
  assert.equal(
    reminderOccurrence(base, new Date(2026, 1, 28, 13, 29)),
    "2026-01-31T13:30",
  );
});
test("once and daily never deliver before start; daily catches latest elapsed time", () => {
  const r = { ...base, repeat: "daily" as const };
  assert.equal(reminderOccurrence(r, new Date(2026, 0, 31, 13, 29)), null);
  assert.equal(
    reminderOccurrence(r, new Date(2026, 1, 2, 13, 29)),
    "2026-02-01T13:30",
  );
  assert.equal(
    reminderOccurrence({ ...r, repeat: "once" }, new Date(2026, 5, 1)),
    "2026-01-31T13:30",
  );
  assert.equal(
    reminderOccurrence({ ...r, enabled: false }, new Date(2026, 5, 1)),
    null,
  );
});
test("reminder validation rejects impossible dates and times", () => {
  assert.equal(validReminder(base), true);
  for (const patch of [
    { date: "2026-02-30" },
    { time: "25:00" },
    { title: "" },
    { repeat: "weekly" },
    { seen: 12 },
  ])
    assert.equal(validReminder({ ...base, ...patch }), false);
});
test("chat context finds matching dates and computes complete monthly totals", () => {
  const entries = Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => {
      const d = new Date(2026, 0, i + 1);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return [
        date,
        {
          studyMinutes: 60,
          logged: true,
          remark: i === 0 ? "Excel special session" : "Other session",
        },
      ];
    }),
  );
  const context = chatContext(entries, "Find Excel");
  assert.equal(context.loggedDays, 60);
  assert.equal(context.selectedDays[0].date, "2026-01-01");
  assert.ok(context.omittedDays > 0);
  assert.equal(
    Object.values(context.monthlyTotals).reduce((sum, m) => sum + m.days, 0),
    60,
  );
});
