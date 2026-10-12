"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { durationLabel } from "@/lib/activity";
import {
  TIME_CATEGORIES,
  EMPTY_TIME_LOG,
  blockMinutes,
  scheduleTemplate,
  splitLearningBlock,
  LUNCH_ID,
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
  const editableBlocks = value.blocks.filter(
    (block) =>
      block.id !== LUNCH_ID &&
      !(
        block.category === "break" &&
        block.start === "13:30" &&
        block.end === "14:30"
      ),
  );
  const [focusId, setFocusId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (focusId)
      document.getElementById(`activity-category-${focusId}`)?.focus();
  }, [focusId]);
  function update(id: string, changes: Partial<TimeBlock>) {
    onChange({
      ...value,
      blocks: value.blocks.map((block) =>
        block.id === id ? { ...block, ...changes } : block,
      ),
    });
    setError("");
  }
  function add() {
    const id = crypto.randomUUID();
    onChange({
      ...value,
      blocks: [
        ...value.blocks,
        { id, start: "", end: "", category: "studying", topic: "" },
      ],
    });
    setFocusId(id);
  }
  return (
    <section className="simple-activities" aria-labelledby="activities-heading">
      <div className="simple-activity-heading">
        <h3 id="activities-heading">Activities</h3>
        {!editableBlocks.length && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange({ ...value, blocks: scheduleTemplate(date) })
            }
          >
            Use daily schedule
          </button>
        )}
      </div>
      <p className="field-help">
        Lunch is fixed at 1:30–2:30 PM and excluded automatically. Learning
        includes batches and free time. Huddles and meetings are miscellaneous.
      </p>
      {!editableBlocks.length && (
        <p className="field-help">
          Add an activity and its times. Totals update automatically.
        </p>
      )}
      <div className="simple-activity-list">
        {editableBlocks.map((block, index) => {
          const duration = blockMinutes(block);
          const valid = Number.isFinite(duration) && duration > 0;
          return (
            <article className="simple-activity" key={block.id}>
              <div className="simple-activity-row">
                <label>
                  Activity
                  <select
                    id={`activity-category-${block.id}`}
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
                  Start
                  <input
                    type="time"
                    value={block.start}
                    onChange={(event) =>
                      update(block.id, { start: event.target.value })
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    value={block.end}
                    onChange={(event) =>
                      update(block.id, { end: event.target.value })
                    }
                  />
                </label>
                <span className="simple-activity-duration">
                  {valid ? durationLabel(duration) : "—"}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove activity ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      blocks: value.blocks.filter(
                        (item) => item.id !== block.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {block.category === "studying" && (
                <label className="simple-topic">
                  <span className="sr-only">
                    Activity {index + 1} description
                  </span>
                  <input
                    maxLength={160}
                    placeholder="Topic or note (optional)"
                    value={block.topic}
                    onChange={(event) =>
                      update(block.id, { topic: event.target.value })
                    }
                  />
                </label>
              )}
              {block.category !== "studying" && (
                <details className="simple-split">
                  <summary>{block.topic || "Add a note"}</summary>
                  <label className="simple-topic">
                    <span className="sr-only">Activity {index + 1} note</span>
                    <input
                      maxLength={160}
                      placeholder="Note (optional)"
                      value={block.topic}
                      onChange={(event) =>
                        update(block.id, { topic: event.target.value })
                      }
                    />
                  </label>
                </details>
              )}
              {block.category === "studying" && valid && (
                <details className="simple-split">
                  <summary>Split with free time</summary>
                  <LearningSplit
                    block={block}
                    onSplit={(minutes) => {
                      try {
                        const split = splitLearningBlock(block, minutes);
                        onChange({
                          ...value,
                          blocks: value.blocks.flatMap((item) =>
                            item.id === block.id ? split : [item],
                          ),
                        });
                        setError("");
                      } catch (failure) {
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "Check the minutes.",
                        );
                      }
                    }}
                  />
                </details>
              )}
            </article>
          );
        })}
      </div>
      <button
        type="button"
        className="secondary-button simple-add-activity"
        disabled={value.blocks.length >= 100}
        onClick={add}
      >
        <Plus size={17} />
        Add activity
      </button>
      {(value.miscAdjustment > 0 || value.extraFreeMinutes > 0) && (
        <details className="simple-split">
          <summary>Saved time adjustments</summary>
          <div className="simple-adjustments">
            <label>
              Learning moved to other work (minutes)
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
              Extra free time (minutes)
              <input
                type="number"
                min="0"
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
        </details>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
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
    <div className="simple-split-form">
      <label>
        Learning minutes
        <input
          type="number"
          min="0"
          max={blockMinutes(block)}
          step="1"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={!minutes.trim()}
        onClick={() => onSplit(Number(minutes))}
      >
        Split
      </button>
      <small>
        The remaining minutes become free time, included in learning.
      </small>
    </div>
  );
}
