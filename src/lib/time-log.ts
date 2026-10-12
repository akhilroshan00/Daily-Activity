import type { DayEntry } from "./activity";

export const TIME_CATEGORIES = {
  teaching: "Batch / teaching",
  studying: "Learning",
  misc: "Miscellaneous / huddle",
  break: "Break / lunch",
  free: "Free time",
} as const;
export type TimeCategory = keyof typeof TIME_CATEGORIES;
export type TimeBlock = {
  id: string;
  start: string;
  end: string;
  category: TimeCategory;
  topic: string;
};
export type TimeLog = {
  blocks: TimeBlock[];
  miscAdjustment: number;
  extraFreeMinutes: number;
};
export const EMPTY_TIME_LOG: TimeLog = {
  blocks: [],
  miscAdjustment: 0,
  extraFreeMinutes: 0,
};
export function clockMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function blockMinutes(block: TimeBlock) {
  return clockMinutes(block.end) - clockMinutes(block.start);
}
export function timeLogTotals(log: TimeLog) {
  const totals = {
    teaching: 0,
    studying: 0,
    misc: 0,
    break: 0,
    free: log.extraFreeMinutes,
  };
  for (const block of log.blocks) totals[block.category] += blockMinutes(block);
  totals.studying -= log.miscAdjustment;
  totals.misc += log.miscAdjustment;
  return totals;
}
export function validateTimeLog(value: unknown): TimeLog {
  if (!value || typeof value !== "object")
    throw new Error("Invalid daily time log.");
  const log = value as TimeLog;
  if (
    !Array.isArray(log.blocks) ||
    log.blocks.length > 100 ||
    !Number.isInteger(log.miscAdjustment) ||
    log.miscAdjustment < 0 ||
    !Number.isInteger(log.extraFreeMinutes) ||
    log.extraFreeMinutes < 0
  )
    throw new Error("Enter valid whole minutes for time adjustments.");
  const ids = new Set<string>();
  const blocks = log.blocks.map((block) => {
    if (
      !block ||
      typeof block.id !== "string" ||
      !block.id ||
      block.id.length > 100 ||
      ids.has(block.id) ||
      !Object.hasOwn(TIME_CATEGORIES, block.category) ||
      typeof block.topic !== "string" ||
      block.topic.length > 160 ||
      ![block.start, block.end].every(
        (time) =>
          typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time),
      ) ||
      block.end <= block.start
    )
      throw new Error("Give each activity a valid start and later end time.");
    ids.add(block.id);
    return {
      id: block.id,
      start: block.start,
      end: block.end,
      category: block.category,
      topic: block.topic.trim(),
    };
  });
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  if (
    sorted.some(
      (block, index) => index > 0 && block.start < sorted[index - 1].end,
    )
  )
    throw new Error(
      "Time activities overlap. Split or move them before saving.",
    );
  const rawLearning = blocks
    .filter((block) => block.category === "studying")
    .reduce((sum, block) => sum + blockMinutes(block), 0);
  if (log.miscAdjustment > rawLearning)
    throw new Error(
      "Only logged schedule learning can be reclassified as miscellaneous.",
    );
  if (
    blocks.reduce((sum, block) => sum + blockMinutes(block), 0) +
      log.extraFreeMinutes >
    1440
  )
    throw new Error("A day cannot contain more than 24 logged hours.");
  return {
    blocks,
    miscAdjustment: log.miscAdjustment,
    extraFreeMinutes: log.extraFreeMinutes,
  };
}
export function dayTimeTotals(entry?: DayEntry) {
  const scheduled = entry?.timeLog ? timeLogTotals(entry.timeLog) : null;
  const study = entry?.studyMinutes ?? 0;
  const misc = scheduled?.misc ?? 540 - study;
  const teaching = scheduled?.teaching ?? 0;
  const breaks = scheduled?.break ?? 0;
  const free = scheduled?.free ?? 0;
  return {
    study,
    misc,
    teaching,
    breaks,
    free,
    work: study + misc + teaching,
    logged: study + misc + teaching + breaks + free,
  };
}
export function scheduleLearning(log?: TimeLog) {
  return log ? timeLogTotals(log).studying : 0;
}
export function learningTopics(entry: DayEntry) {
  const tasks = entry.tasks ?? [];
  const taskTotal = tasks.reduce((sum, task) => sum + (task.minutes ?? 0), 0);
  const scheduled = scheduleLearning(entry.timeLog);
  const topics: { topic: string; minutes: number }[] = [];
  if (entry.timeLog && scheduled > 0) {
    const blocks = entry.timeLog.blocks.filter(
      (block) => block.category === "studying",
    );
    const raw = blocks.reduce((sum, block) => sum + blockMinutes(block), 0);
    for (const block of blocks)
      topics.push({
        topic: block.topic || "General learning",
        minutes: (blockMinutes(block) * scheduled) / raw,
      });
  }
  const additionalTasks = Math.max(0, taskTotal - scheduled);
  for (const task of tasks)
    if (taskTotal && additionalTasks)
      topics.push({
        topic: task.subject?.trim() || "Uncategorised",
        minutes: ((task.minutes ?? 0) * additionalTasks) / taskTotal,
      });
  const unassigned = Math.max(
    0,
    entry.studyMinutes - Math.max(taskTotal, scheduled),
  );
  if (unassigned)
    topics.push({ topic: "General learning", minutes: unassigned });
  // Allocate whole minutes while retaining the exact daily total.
  let remainder = entry.studyMinutes;
  return topics
    .map((topic, index) => {
      const minutes =
        index === topics.length - 1
          ? remainder
          : Math.min(remainder, Math.round(topic.minutes));
      remainder -= minutes;
      return { ...topic, minutes };
    })
    .filter((topic) => topic.minutes > 0);
}
export function scheduleTemplate(date: Date): TimeBlock[] {
  const weekend = [0, 6].includes(date.getDay());
  const rows: [string, string, TimeCategory, string][] = weekend
    ? [
        ["09:30", "09:40", "misc", "Miscellaneous"],
        ["09:40", "10:00", "misc", "Huddle"],
        ["13:30", "14:30", "break", "Lunch break"],
      ]
    : [
        ["09:00", "09:10", "free", "Free time"],
        ["09:10", "09:30", "misc", "Huddle"],
        ["09:30", "11:30", "teaching", "Morning batch"],
        ["11:30", "13:30", "teaching", "Late morning batch"],
        ["13:30", "14:30", "break", "Lunch break"],
        ["14:30", "16:30", "teaching", "Afternoon batch"],
        ["16:30", "18:00", "studying", "Learning time"],
      ];
  return rows.map(([start, end, category, topic], index) => ({
    id: `schedule:${index}`,
    start,
    end,
    category,
    topic,
  }));
}
export function splitLearningBlock(
  block: TimeBlock,
  minutes: number,
): TimeBlock[] {
  const total = blockMinutes(block);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > total)
    throw new Error(`Enter between 0 and ${total} learning minutes.`);
  const split = clockMinutes(block.start) + minutes;
  const time = `${String(Math.floor(split / 60)).padStart(2, "0")}:${String(split % 60).padStart(2, "0")}`;
  return [
    ...(minutes
      ? [{ ...block, end: time, category: "studying" as const }]
      : []),
    ...(minutes < total
      ? [
          {
            ...block,
            id: `${block.id.slice(0, 60)}:free:${time}`,
            start: time,
            category: "free" as const,
            topic: "Free time",
          },
        ]
      : []),
  ];
}
