import { type Entries } from "./activity";
import { dayTimeTotals, effectiveTimeLog } from "./time-log";
export function chatContext(entries: Entries, question: string) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) || [];
  const rows = Object.entries(entries)
    .filter(([, e]) => e.logged)
    .map(([date, e]) => ({
      date,
      totals: dayTimeTotals(e),
      notes: e.remark,
      activities: effectiveTimeLog(e)?.blocks || [],
      tasks: e.tasks || [],
    }));
  const months: Record<
    string,
    { learningMinutes: number; miscMinutes: number; days: number }
  > = {};
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const m = (months[key] ??= { learningMinutes: 0, miscMinutes: 0, days: 0 });
    m.learningMinutes += row.totals.study;
    m.miscMinutes += row.totals.misc;
    m.days++;
  }
  const scored = rows
    .map((row) => ({
      row,
      score: words.reduce(
        (sum, word) =>
          sum + (JSON.stringify(row).toLowerCase().includes(word) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || b.row.date.localeCompare(a.row.date));
  const selected: typeof rows = [];
  let size = 0;
  for (const { row } of scored.slice(0, 40)) {
    const length = JSON.stringify(row).length;
    if (size + length > 24000) continue;
    selected.push(row);
    size += length;
  }
  return {
    loggedDays: rows.length,
    monthlyTotals: months,
    selectedDays: selected,
    omittedDays: rows.length - selected.length,
  };
}
