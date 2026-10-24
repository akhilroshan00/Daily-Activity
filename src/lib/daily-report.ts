import { parseISO, format } from "date-fns";
import {
  dateKey,
  isHoliday,
  durationLabel,
  TASK_STATUSES,
  type DayEntry,
} from "./activity";
import { formatClock } from "./clock";
import {
  dayTimeTotals,
  effectiveTimeLog,
  TIME_CATEGORIES,
  blockMinutes,
  LUNCH_ID,
} from "./time-log";

export const REPORT_TIME_ZONE = "Asia/Kolkata";
export const REPORT_TEMPLATE_LIMIT = 6000;
export const REPORT_TEXT_LIMIT = 16000;
export const REPORT_INSTRUCTION_LIMIT = 1500;
export const REPORT_STYLES = {
  simpler: { label: "Simpler", description: "Short, clear and easy to read." },
  explained: {
    label: "Explained",
    description: "More detail with clear explanations.",
  },
  professional: {
    label: "Professional",
    description: "Polished wording for work.",
  },
} as const;
export type ReportStyle = keyof typeof REPORT_STYLES;
export const REPORT_STYLE_INSTRUCTIONS: Record<ReportStyle, string> = {
  simpler:
    "Use simple everyday language, short sentences and one or two compact bullets per activity. Prioritise brevity while keeping the important facts and incomplete statuses. Avoid unnecessary technical jargon.",
  explained:
    "Provide a fuller explanation with two or three useful supporting bullets for each activity when the source material permits. Develop the supplied details, clarify the purpose or meaning of recorded topics in general terms, and explain what remains unfinished. Do not merely repeat a short summary. Never invent performed actions, specific technical findings, outcomes or acquired skills.",
  professional:
    "Use polished, precise workplace language and clear activity headings. Keep the report well structured and concise, with an accurate, professional tone and no exaggerated accomplishments.",
};
export const DEFAULT_REPORT_TEMPLATE = `Daily Progress Report
Date: {{date}}

1. [Activity title; retain “not completed” when recorded]
- Describe the work recorded in the daily entry.
- Include further details only when the entry supplies them.

2. [Next activity title]
- Describe the recorded work using the same numbered, bullet-point structure.

[Next number]. Key Learnings
- Summarise learnings explicitly recorded in the entries. If none are recorded, say so briefly.

Summary
A short first-person paragraph summarising the day's recorded activities and progress.`;

export type DailyReport = {
  text: string;
  source: string;
  generatedAt?: string;
  editedAt?: string;
  style?: ReportStyle;
  sentAt?: string;
  remindedAt?: string;
  snoozedUntil?: string;
};
export type ReportStore = {
  version: 1;
  template: string;
  reports: Record<string, DailyReport>;
};
export function validReportDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parseISO(value).getTime()) &&
    dateKey(parseISO(value)) === value
  );
}
export function readReportStore(raw: string | null): ReportStore {
  if (raw === null)
    return { version: 1, template: DEFAULT_REPORT_TEMPLATE, reports: {} };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object")
    throw new Error("Invalid report storage.");
  const store = value as ReportStore;
  if (
    store.version !== 1 ||
    typeof store.template !== "string" ||
    !store.template.trim() ||
    store.template.length > REPORT_TEMPLATE_LIMIT ||
    !store.reports ||
    typeof store.reports !== "object" ||
    Array.isArray(store.reports) ||
    Object.keys(store.reports).length > 36600
  )
    throw new Error("Invalid report storage.");
  for (const [date, report] of Object.entries(store.reports)) {
    if (
      !validReportDate(date) ||
      !report ||
      typeof report !== "object" ||
      typeof report.text !== "string" ||
      report.text.length > REPORT_TEXT_LIMIT ||
      typeof report.source !== "string" ||
      report.source.length > 100 ||
      (report.style !== undefined &&
        !Object.hasOwn(REPORT_STYLES, report.style)) ||
      [
        report.generatedAt,
        report.editedAt,
        report.sentAt,
        report.remindedAt,
        report.snoozedUntil,
      ].some(
        (stamp) =>
          stamp !== undefined &&
          (typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))),
      )
    )
      throw new Error("Invalid saved report.");
  }
  return store;
}
export function emptyReport(): DailyReport {
  return { text: "", source: "" };
}

export class ReportConflictError extends Error {}

export function editReportText(
  store: ReportStore,
  date: string,
  text: string,
  expectedText: string,
  source: string,
  now: string,
): ReportStore {
  if (!validReportDate(date) || text.length > REPORT_TEXT_LIMIT)
    throw new ReportConflictError(
      "Choose a valid date and keep the report within 16,000 characters.",
    );
  const current = store.reports[date];
  if ((current?.text ?? "") !== expectedText)
    throw new ReportConflictError(
      "This report changed in another tab. Your edits are still in the editor; copy them before loading the newer version.",
    );
  if (text === expectedText) return store;
  return {
    ...store,
    reports: {
      ...store.reports,
      [date]: {
        ...(current ?? emptyReport()),
        text,
        source: current?.source || source,
        editedAt: now,
        sentAt: undefined,
      },
    },
  };
}

export function canReplaceReport(
  latest: DailyReport | undefined,
  previous: DailyReport | undefined,
) {
  return (
    (latest?.text ?? "") === (previous?.text ?? "") &&
    latest?.sentAt === previous?.sentAt &&
    latest?.editedAt === previous?.editedAt
  );
}
export function hasReportEntry(entry?: DayEntry) {
  return Boolean(
    entry &&
    (entry.logged ||
      entry.remark.trim() ||
      entry.importantTask ||
      entry.tasks?.length ||
      entry.leave ||
      entry.holiday),
  );
}

// This is the same accounting used by the calendar and exports. Historical task
// records are labelled separately so they cannot be counted as new activities.
export function dailyReportContext(date: string, entry?: DayEntry) {
  if (!validReportDate(date)) throw new Error("Choose a valid report date.");
  const holiday = Boolean(isHoliday(parseISO(date), entry));
  const logged = Boolean(entry?.logged && !holiday);
  const totals = dayTimeTotals(logged ? entry : undefined);
  const tasks = (entry?.tasks ?? []).map((task) => ({
    title: task.title,
    status: TASK_STATUSES[task.status],
    notes: task.notes,
  }));
  return {
    date: format(parseISO(date), "d MMMM yyyy"),
    dayType: entry?.leave ? "Leave" : holiday ? "Holiday" : "Working day",
    logged,
    timeBasis:
      entry?.timeMode === "activities"
        ? "Saved activity times"
        : "Historical allocations; not verified timestamps",
    activities:
      logged && entry
        ? effectiveTimeLog(entry).blocks.map((block) => ({
            category: TIME_CATEGORIES[block.category],
            topic: block.topic,
            start: formatClock(block.start),
            end: formatClock(block.end),
            duration: durationLabel(blockMinutes(block)),
            source: block.id.startsWith("unassigned:misc")
              ? "Automatically allocated gap; not an explicitly recorded activity"
              : block.id === LUNCH_ID
                ? "Fixed lunch break"
                : "Saved activity",
          }))
        : [],
    timeTotals: Object.fromEntries(
      Object.entries(totals).map(([key, minutes]) => [
        key,
        durationLabel(minutes),
      ]),
    ),
    notes: entry?.remark ?? "",
    importantTask: entry?.importantTask ?? "",
    recordedTasks: entry?.timeMode === "activities" ? [] : tasks,
    historicalTasks: entry?.timeMode === "activities" ? tasks : [],
  };
}

// A cache identifier only, never an authentication or integrity check.
export function reportSource(
  date: string,
  entry: DayEntry | undefined,
  template: string,
) {
  const content = JSON.stringify([dailyReportContext(date, entry), template]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < content.length; i++) {
    a = Math.imul(a ^ content.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ content.charCodeAt(i);
  }
  return `${content.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export function reportClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
export function reportReminderDue(now: Date, report?: DailyReport) {
  if (reportClock(now).minutes < 17 * 60 || report?.sentAt) return false;
  if (report?.snoozedUntil)
    return Date.parse(report.snoozedUntil) <= now.getTime();
  return !report?.remindedAt;
}
export function nextReportCheck(now: Date, report?: DailyReport) {
  const { date, minutes } = reportClock(now);
  if (minutes < 17 * 60)
    return Date.parse(`${date}T17:00:00+05:30`) - now.getTime();
  if (report?.snoozedUntil && Date.parse(report.snoozedUntil) > now.getTime())
    return Date.parse(report.snoozedUntil) - now.getTime();
  // Midnight changes the report date; focus/visibility events catch suspended tabs.
  return Date.parse(`${date}T00:00:00+05:30`) + 86400000 - now.getTime();
}
