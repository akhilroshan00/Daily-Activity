import type { DayEntry, Entries } from "./activity";

export const TIME_CATEGORIES = {
  teaching: "Batch / teaching",
  studying: "Learning",
  misc: "Miscellaneous / huddle / meeting",
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
export const LUNCH_ID = "fixed:lunch";
export function activityCategory(title: string): TimeCategory {
  if (/\b(lunch|break)\b/i.test(title)) return "break";
  if (/\b(huddles?|meetings?|miscellaneous)\b/i.test(title)) return "misc";
  if (/\b(batch|batches|teaching)\b/i.test(title)) return "teaching";
  if (/\bfree\s*time\b/i.test(title)) return "free";
  return "studying";
}
// Remove lunch from every activity, preserving both sides of crossing ranges.
// Stable IDs make normalization safe to repeat on saved logs.
export function withLunch(log: TimeLog): TimeLog {
  const blocks = log.blocks.flatMap((block): TimeBlock[] => {
    const inferred = activityCategory(block.topic);
    if (inferred === "misc" || /\blunch\b/i.test(block.topic))
      block = { ...block, category: inferred };
    if (!block.start || !block.end || block.end <= block.start) return [block];
    if (block.end <= "13:30" || block.start >= "14:30") return [block];
    return [
      ...(block.start < "13:30" ? [{ ...block, end: "13:30" }] : []),
      ...(block.end > "14:30"
        ? [
            {
              ...block,
              id: `${block.id.slice(0, 85)}:after-lunch`,
              start: "14:30",
            },
          ]
        : []),
    ];
  });
  if (
    !blocks.some(
      (b) =>
        b.id === LUNCH_ID ||
        (b.category === "break" && b.start === "13:30" && b.end === "14:30"),
    )
  ) {
    blocks.push({
      id: LUNCH_ID,
      start: "13:30",
      end: "14:30",
      category: "break",
      topic: "Lunch break",
    });
  }
  return {
    ...log,
    blocks: blocks.sort((a, b) => a.start.localeCompare(b.start)),
  };
}
export function fillWorkdayGaps(blocks: TimeBlock[]): TimeBlock[] {
  const clean = blocks.filter((b) => !b.id.startsWith("unassigned:misc"));
  const result = [...clean];
  let cursor = "09:00";
  const valid = clean
    .filter((b) => b.start && b.end && b.start < b.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const block of valid) {
    if (block.start > cursor && cursor < "18:00") {
      const end = block.start < "18:00" ? block.start : "18:00";
      if (end > cursor) {
        result.push({
          id: `unassigned:misc:${cursor}`,
          start: cursor,
          end,
          category: "misc",
          topic: "Miscellaneous",
        });
      }
    }
    if (block.end > cursor) cursor = block.end;
  }
  if (cursor < "18:00") {
    result.push({
      id: `unassigned:misc:${cursor}`,
      start: cursor,
      end: "18:00",
      category: "misc",
      topic: "Miscellaneous",
    });
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
export function effectiveTimeLog(entry: DayEntry): TimeLog {
  if (entry.timeLog) {
    const rawBlocks = entry.timeLog.blocks.filter(
      (b) => !b.id.startsWith("unassigned:misc"),
    );
    const hasActivities =
      rawBlocks.some(
        (b) =>
          b.id !== LUNCH_ID &&
          !(
            b.category === "break" &&
            b.start === "13:30" &&
            b.end === "14:30"
          ),
      ) ||
      entry.timeLog.blocks.some((b) => b.id.startsWith("unassigned:misc")) ||
      entry.timeLog.extraFreeMinutes > 0;
    const isXlsx =
      rawBlocks.some((b) => b.id.startsWith("xlsx:")) &&
      rawBlocks.every(
        (b) => b.id === LUNCH_ID || b.id.startsWith("xlsx:"),
      );
    const isWeekend = entry.timeLog.blocks.some(
      (b) => b.id === "weekend" || b.id.startsWith("weekend:"),
    );
    if ((!hasActivities && !entry.logged) || isWeekend || isXlsx) {
      return withLunch({ ...entry.timeLog, blocks: rawBlocks });
    }
    const lunched = withLunch({ ...entry.timeLog, blocks: rawBlocks });
    const blocks = fillWorkdayGaps(lunched.blocks);
    return {
      ...entry.timeLog,
      blocks,
    };
  }
  const tasks = (entry.tasks ?? []).filter((task) => (task.minutes ?? 0) > 0);
  const timed =
    tasks.length > 0 && tasks.every((task) => task.fromTime && task.toTime);
  const blocks: TimeBlock[] = timed
    ? tasks.map((task) => ({
        id: task.id,
        start: task.fromTime!,
        end: task.toTime!,
        category: activityCategory(task.title),
        topic: task.title,
      }))
    : [];
  if (timed && tasks.every((task) => task.id.startsWith("xlsx:")))
    return withLunch({ blocks, miscAdjustment: 0, extraFreeMinutes: 0 });
  if (!timed) {
    let cursor = 540;
    for (const task of tasks) {
      blocks.push({
        id: task.id,
        start: minuteClock(cursor),
        end: minuteClock(cursor + task.minutes!),
        category: activityCategory(task.title),
        topic: task.title,
      });
      cursor += task.minutes!;
    }
    if (cursor < 540 + entry.studyMinutes)
      blocks.push({
        id: "legacy:learning",
        start: minuteClock(cursor),
        end: minuteClock(540 + entry.studyMinutes),
        category: "studying",
        topic: "Saved learning",
      });
  }
  const lunched = withLunch({ blocks, miscAdjustment: 0, extraFreeMinutes: 0 });
  const filled = fillWorkdayGaps(lunched.blocks);
  return { blocks: filled, miscAdjustment: 0, extraFreeMinutes: 0 };
}
function minuteClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function learningTotal(log: TimeLog) {
  const totals = timeLogTotals(withLunch(log));
  return totals.studying + totals.teaching + totals.free;
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
export function validateActivities(log: TimeLog) {
  const editable = {
    ...log,
    blocks: log.blocks.filter(
      (block) =>
        block.id !== LUNCH_ID &&
        !(
          block.category === "break" &&
          block.start === "13:30" &&
          block.end === "14:30"
        ),
    ),
  };
  validateTimeLog(editable);
  return validateTimeLog(withLunch(editable));
}
export function dayTimeTotals(entry?: DayEntry) {
  const scheduled = entry?.logged
    ? timeLogTotals(effectiveTimeLog(entry))
    : null;
  const study = scheduled
    ? scheduled.studying + scheduled.teaching + scheduled.free
    : 0;
  const misc = scheduled?.misc ?? 0;
  const teaching = scheduled?.teaching ?? 0;
  const breaks = scheduled?.break ?? 0;
  const free = scheduled?.free ?? 0;
  return {
    study,
    misc,
    teaching,
    breaks,
    free,
    work: study + misc,
    logged: study + misc + breaks,
  };
}
export function scheduleLearning(log?: TimeLog) {
  return log ? timeLogTotals(log).studying : 0;
}
export function learningTopics(entry: DayEntry) {
  const log = effectiveTimeLog(entry);
  const total = dayTimeTotals(entry).study;
  const learning = log.blocks.filter((block) =>
    ["studying", "teaching", "free"].includes(block.category),
  );
  const raw =
    learning.reduce((sum, block) => sum + blockMinutes(block), 0) +
    log.extraFreeMinutes;
  const topics = learning.map((block) => ({
    topic: block.topic || TIME_CATEGORIES[block.category],
    minutes: blockMinutes(block),
  }));
  if (log.extraFreeMinutes)
    topics.push({ topic: "Free time", minutes: log.extraFreeMinutes });
  let remaining = total;
  return topics
    .map((topic, index) => {
      const minutes =
        index === topics.length - 1
          ? remaining
          : Math.min(remaining, Math.round((topic.minutes * total) / raw));
      remaining -= minutes;
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

export function reconcileDayMiscellaneous(entry: DayEntry): DayEntry {
  if (!entry || !entry.logged || entry.leave || entry.holiday) return entry;
  let baseLog = entry.timeLog;
  if (!baseLog) {
    const tasks = (entry.tasks ?? []).filter((task) => (task.minutes ?? 0) > 0);
    const timed =
      tasks.length > 0 && tasks.every((task) => task.fromTime && task.toTime);
    if (timed) {
      baseLog = {
        blocks: tasks.map((task) => ({
          id: task.id,
          start: task.fromTime!,
          end: task.toTime!,
          category: activityCategory(task.title),
          topic: task.title,
        })),
        miscAdjustment: 0,
        extraFreeMinutes: 0,
      };
    } else {
      let cursor = 540;
      const blocks: TimeBlock[] = [];
      for (const task of tasks) {
        blocks.push({
          id: task.id,
          start: minuteClock(cursor),
          end: minuteClock(cursor + task.minutes!),
          category: activityCategory(task.title),
          topic: task.title,
        });
        cursor += task.minutes!;
      }
      if (cursor < 540 + entry.studyMinutes) {
        blocks.push({
          id: "legacy:learning",
          start: minuteClock(cursor),
          end: minuteClock(540 + entry.studyMinutes),
          category: "studying",
          topic: "Saved learning",
        });
      }
      baseLog = { blocks, miscAdjustment: 0, extraFreeMinutes: 0 };
    }
  }
  const cleanBlocks = baseLog.blocks.filter(
    (b) => !b.id.startsWith("unassigned:misc"),
  );
  const lunched = withLunch({ ...baseLog, blocks: cleanBlocks });
  const filled = fillWorkdayGaps(lunched.blocks);
  const effective: TimeLog = {
    ...baseLog,
    blocks: filled,
  };
  if (!effective.blocks.length) return entry;
  return {
    ...entry,
    studyMinutes: learningTotal(effective),
    timeLog: effective,
    timeMode: "activities",
  };
}

export function reconcileAllEntries(entries: Entries): {
  entries: Entries;
  updatedCount: number;
} {
  let updatedCount = 0;
  const result: Entries = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.logged && !entry.leave && !entry.holiday) {
      const reconciled = reconcileDayMiscellaneous(entry);
      if (JSON.stringify(reconciled.timeLog) !== JSON.stringify(entry.timeLog)) {
        updatedCount++;
        result[key] = reconciled;
        continue;
      }
    }
    result[key] = entry;
  }
  return { entries: result, updatedCount };
}
