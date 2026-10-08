import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseISO } from "date-fns";
import { buildDailyEntry, dailyHours } from "../src/lib/day-editor";
import {
  activityRows,
  monthDays,
  monthTotals,
  type LearningTask,
} from "../src/lib/activity";
import { addFocusMinutes } from "../src/lib/learning";
import { readTheme, THEME_INIT_SCRIPT } from "../src/lib/ui-preferences";
import { runInNewContext } from "node:vm";

const day = "2026-10-08";
const tasks: LearningTask[] = [
  { id: "a", title: " React ", status: "in-progress", notes: " Hooks " },
  { id: "b", title: "API", status: "completed", notes: "" },
];

test("daily hours with several untimed tasks reconcile with dashboard and export totals", () => {
  const entry = buildDailyEntry(day, undefined, tasks, "4", false);
  assert.equal(entry.timeMode, "manual");
  assert.equal(entry.tasks?.[0].title, "React");
  const days = monthDays(parseISO(day), { [day]: entry });
  assert.equal(monthTotals(days).studyMinutes, 240);
  assert.equal(
    activityRows(days)
      .filter((row) => row.date === "08/10/2026")
      .reduce((sum, row) => sum + row.hours, 0),
    9,
  );
});

test("blank hours save a plan, explicit zero logs a working day, and invalid totals are rejected", () => {
  const planned = buildDailyEntry(day, undefined, tasks, "", false);
  assert.equal(planned.logged, false);
  assert.equal(
    monthTotals(monthDays(parseISO(day), { [day]: planned })).miscMinutes,
    0,
  );
  assert.equal(buildDailyEntry(day, undefined, tasks, "0", false).logged, true);
  for (const value of ["-1", "10", "NaN"])
    assert.throws(() => buildDailyEntry(day, undefined, tasks, value, false));
  assert.throws(() => buildDailyEntry(day, undefined, [], "", false));
});

test("editing legacy task totals preserves metadata, reflection and focus receipts without duplicating time", () => {
  const old = {
    ...buildDailyEntry(
      day,
      undefined,
      [
        {
          ...tasks[0],
          minutes: 60,
          priority: "high" as const,
          dueDate: "2026-10-09",
        },
      ],
      "1",
      false,
    ),
    timeMode: "tasks" as const,
    remark: "Old reflection",
    focusSessions: ["receipt"],
  };
  assert.equal(dailyHours(old), "1");
  const edited = buildDailyEntry(day, old, old.tasks!, "2", false);
  assert.equal(edited.remark, old.remark);
  assert.deepEqual(edited.focusSessions, old.focusSessions);
  assert.deepEqual(edited.tasks, old.tasks);
  assert.throws(
    () => buildDailyEntry(day, old, old.tasks!, "0.5", false),
    /saved task and focus time/,
  );
  const focused = addFocusMinutes(
    { [day]: edited },
    day,
    "a",
    30,
    "new-receipt",
  );
  assert.equal(focused[day].studyMinutes, 150);
  assert.equal(focused[day].tasks?.[0].minutes, 90);
});

test("holidays hide retained learning totals and restoring a working day recovers them", () => {
  const old = buildDailyEntry(day, undefined, tasks, "3", false);
  const holiday = buildDailyEntry(day, old, old.tasks!, "", true);
  assert.equal(holiday.studyMinutes, 180);
  assert.equal(
    monthTotals(monthDays(parseISO(day), { [day]: holiday })).studyMinutes,
    0,
  );
  const restored = buildDailyEntry(
    day,
    holiday,
    holiday.tasks!,
    dailyHours(holiday),
    false,
  );
  assert.equal(restored.studyMinutes, 180);
});

test("black theme is allowlisted and restored before hydration with either OS preference", () => {
  assert.equal(readTheme("black"), "black");
  assert.equal(readTheme("invalid"), "light");
  for (const dark of [true, false]) {
    const document = {
      documentElement: { dataset: {} as Record<string, string> },
    };
    runInNewContext(THEME_INIT_SCRIPT, {
      document,
      localStorage: { getItem: () => "black" },
      matchMedia: () => ({ matches: dark }),
    });
    assert.equal(document.documentElement.dataset.theme, "black");
  }
});

test("marking a draft as holiday retains its edited hours for switching back", () => {
  const freshHoliday = buildDailyEntry(day, undefined, tasks, "4", true);
  assert.equal(dailyHours(freshHoliday), "4");
  assert.equal(
    monthTotals(monthDays(parseISO(day), { [day]: freshHoliday })).studyMinutes,
    0,
  );
  const old = buildDailyEntry(day, undefined, tasks, "2", false);
  const holiday = buildDailyEntry(day, old, old.tasks!, "4", true);
  assert.equal(holiday.studyMinutes, 240);
  assert.equal(dailyHours(holiday), "4");
  const restored = buildDailyEntry(
    day,
    holiday,
    holiday.tasks!,
    dailyHours(holiday),
    false,
  );
  assert.equal(restored.studyMinutes, 240);
  assert.equal(restored.logged, true);
});

test("reopening a planned day retains its planning state and saved time", () => {
  const planned = {
    ...buildDailyEntry(day, undefined, tasks, "", false),
    studyMinutes: 90,
    tasks: [{ ...tasks[0], minutes: 30 }],
  };
  assert.equal(dailyHours(planned), "");
  const edited = buildDailyEntry(
    day,
    planned,
    [{ ...planned.tasks[0], status: "completed" }],
    dailyHours(planned),
    false,
  );
  assert.equal(edited.logged, false);
  assert.equal(edited.studyMinutes, 90);
  assert.equal(
    monthTotals(monthDays(parseISO(day), { [day]: edited })).studyMinutes,
    0,
  );
  assert.equal(
    addFocusMinutes({ [day]: edited }, day, "a", 15)[day].studyMinutes,
    105,
  );
});
