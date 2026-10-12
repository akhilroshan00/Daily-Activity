"use client";
import { useState } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { durationLabel } from "@/lib/activity";
import {
  TIME_CATEGORIES,
  EMPTY_TIME_LOG,
  blockMinutes,
  scheduleTemplate,
  splitLearningBlock,
  timeLogTotals,
  type TimeBlock,
  type TimeCategory,
  type TimeLog,
} from "@/lib/time-log";

export default function TimeLogEditor({
  date,
  log,
  onChange,
}: {
  date: Date;
  log?: TimeLog;
  onChange: (log: TimeLog) => void;
}) {
  const value = log ?? EMPTY_TIME_LOG;
  const [error, setError] = useState("");
  function update(id: string, changes: Partial<TimeBlock>) {
    onChange({
      ...value,
      blocks: value.blocks.map((block) =>
        block.id === id ? { ...block, ...changes } : block,
      ),
    });
    setError("");
  }
  const totals = timeLogTotals(value);
  return (
    <details className="daily-details activity-log">
      <summary>
        <span>
          <Clock3 size={17} /> Daily activities & breaks
        </span>
        <small>
          {log ? `${value.blocks.length} activities` : "Optional schedule"}
        </small>
      </summary>
      <div className="daily-details-body">
        <p className="field-help">
          Track batches, learning, huddles, lunch and free time. Schedule
          learning includes your task time; it is counted once. Unfilled periods
          stay unlogged.
        </p>
        {!value.blocks.length && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              onChange({ ...value, blocks: scheduleTemplate(date) })
            }
          >
            Use {[0, 6].includes(date.getDay()) ? "weekend" : "weekday"}{" "}
            schedule
          </button>
        )}
        {value.blocks.map((block, index) => (
          <article className="learning-task" key={block.id}>
            <div className="task-metadata">
              <label>
                Activity {index + 1}
                <select
                  value={block.category}
                  onChange={(event) =>
                    update(block.id, {
                      category: event.target.value as TimeCategory,
                    })
                  }
                >
                  {Object.entries(TIME_CATEGORIES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Topic / description
                <input
                  maxLength={160}
                  value={block.topic}
                  onChange={(event) =>
                    update(block.id, { topic: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="task-time-range">
              <label>
                From time
                <input
                  type="time"
                  value={block.start}
                  onChange={(event) =>
                    update(block.id, { start: event.target.value })
                  }
                />
              </label>
              <label>
                To time
                <input
                  type="time"
                  value={block.end}
                  onChange={(event) =>
                    update(block.id, { end: event.target.value })
                  }
                />
              </label>
              <span className="task-duration">
                {block.end > block.start
                  ? durationLabel(blockMinutes(block))
                  : "Check times"}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove activity ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    blocks: value.blocks.filter((item) => item.id !== block.id),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            {block.category === "teaching" && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update(block.id, { category: "studying", topic: "" })
                }
              >
                No batch — use for learning or free time
              </button>
            )}
            {block.category === "studying" && (
              <LearningSplit
                block={block}
                onSplit={(minutes) => {
                  try {
                    const replacement = splitLearningBlock(block, minutes);
                    onChange({
                      ...value,
                      blocks: value.blocks.flatMap((item) =>
                        item.id === block.id ? replacement : [item],
                      ),
                    });
                    setError("");
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Check the learning minutes.",
                    );
                  }
                }}
              />
            )}
          </article>
        ))}
        <button
          type="button"
          className="add-task-button"
          disabled={value.blocks.length >= 100}
          onClick={() =>
            onChange({
              ...value,
              blocks: [
                ...value.blocks,
                {
                  id: crypto.randomUUID(),
                  start: "",
                  end: "",
                  category: "free",
                  topic: "",
                },
              ],
            })
          }
        >
          <Plus size={18} /> Add activity
        </button>
        {log && (
          <>
            <div className="task-metadata">
              <label>
                Reclassify schedule learning as miscellaneous (minutes)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={value.miscAdjustment}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      miscAdjustment: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Additional free time (minutes)
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  value={value.extraFreeMinutes}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      extraFreeMinutes: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="allocation activity-allocation">
              {Object.entries(TIME_CATEGORIES).map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>
                    {durationLabel(Math.max(0, totals[key as TimeCategory]))}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
function LearningSplit({
  block,
  onSplit,
}: {
  block: TimeBlock;
  onSplit: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState("");
  return (
    <div className="task-metadata">
      <label>
        Learning minutes; remaining time becomes free
        <input
          type="number"
          min="0"
          max={Math.max(0, blockMinutes(block))}
          step="1"
          value={minutes}
          placeholder={String(Math.max(0, blockMinutes(block)))}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={!minutes.trim() || !(block.end > block.start)}
        onClick={() => onSplit(Number(minutes))}
      >
        Split learning / free time
      </button>
    </div>
  );
}
