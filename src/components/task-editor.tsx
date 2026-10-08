"use client";

import { useEffect, useState } from "react";
import { Check, ListTodo, Plus, Trash2, Undo2 } from "lucide-react";
import {
  TASK_LIMIT,
  TASK_TITLE_LIMIT,
  TASK_STATUSES,
  REMARK_LIMIT,
  type LearningTask,
  type TaskStatus,
  dateKey,
} from "@/lib/activity";

type Props = {
  tasks: LearningTask[];
  onChange: (tasks: LearningTask[]) => void;
};

export default function TaskEditor({ tasks, onChange }: Props) {
  const [focusId, setFocusId] = useState("");
  const [removed, setRemoved] = useState<{
    task: LearningTask;
    index: number;
  } | null>(null);
  const completed = tasks.filter((task) => task.status === "completed").length;
  useEffect(() => {
    if (focusId) document.getElementById(`task-title-${focusId}`)?.focus();
  }, [focusId]);

  function updateTask(id: string, changes: Partial<LearningTask>) {
    onChange(
      tasks.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    );
  }
  function addTask() {
    if (tasks.length >= TASK_LIMIT) return;
    const id = crypto.randomUUID();
    onChange([...tasks, { id, title: "", status: "todo", notes: "" }]);
    setFocusId(id);
  }

  return (
    <section className="task-editor" aria-labelledby="tasks-heading">
      <div className="task-section-heading">
        <div className="task-heading-icon">
          <ListTodo size={21} />
        </div>
        <div>
          <h3 id="tasks-heading">Your learning tasks</h3>
          <p>One task for each thing you want to learn.</p>
        </div>
        <span className="task-count">{tasks.length} tasks</span>
      </div>
      {tasks.length > 0 && (
        <div className="task-completion">
          <span>
            <Check size={14} /> {completed} of {tasks.length} completed
          </span>
          <progress
            value={completed}
            max={tasks.length}
            aria-label="Learning tasks completed"
          />
        </div>
      )}
      {!tasks.length && (
        <div className="tasks-empty">
          <BookIllustration />
          <strong>Big learning starts with small tasks.</strong>
          <p>
            Add a topic, exercise or course. Give each one its own status and
            notes.
          </p>
        </div>
      )}
      <div className="task-list">
        {tasks.map((task, index) => (
          <article
            className={`learning-task task-${task.status}`}
            key={task.id}
          >
            <div className="task-row">
              <span className="task-number" aria-hidden="true">
                {task.status === "completed" ? (
                  <Check size={15} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </span>
              <label
                className="task-title-field"
                htmlFor={`task-title-${task.id}`}
              >
                <span className="sr-only">Task {index + 1} title</span>
                <input
                  id={`task-title-${task.id}`}
                  required
                  maxLength={TASK_TITLE_LIMIT}
                  value={task.title}
                  placeholder="What are you learning?"
                  onChange={(event) =>
                    updateTask(task.id, { title: event.target.value })
                  }
                />
              </label>
              <label className={`task-status-control status-${task.status}`}>
                <span className="sr-only">Task {index + 1} status</span>
                <select
                  value={task.status}
                  onChange={(event) =>
                    updateTask(task.id, {
                      status: event.target.value as TaskStatus,
                    })
                  }
                >
                  {Object.entries(TASK_STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="icon-button task-remove"
                aria-label={`Remove task ${index + 1}`}
                onClick={() => {
                  setRemoved({ task, index });
                  onChange(tasks.filter((item) => item.id !== task.id));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="task-metadata">
              <label>
                Minutes learned
                <input
                  type="number"
                  min={0}
                  max={540}
                  step={1}
                  value={task.minutes ?? 0}
                  onChange={(event) =>
                    updateTask(task.id, { minutes: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Priority
                <select
                  value={task.priority ?? "medium"}
                  onChange={(event) =>
                    updateTask(task.id, {
                      priority: event.target.value as LearningTask["priority"],
                    })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={task.dueDate ?? ""}
                  onChange={(event) =>
                    updateTask(task.id, { dueDate: event.target.value })
                  }
                />
              </label>
              {task.dueDate &&
                task.dueDate < dateKey(new Date()) &&
                task.status !== "completed" && (
                  <span className="overdue-badge">Overdue</span>
                )}
            </div>
            <details className="task-notes">
              <summary>
                {task.notes
                  ? "View notes & next steps"
                  : "Add notes & next steps"}
              </summary>
              <label className="sr-only" htmlFor={`task-notes-${task.id}`}>
                Task {index + 1} notes
              </label>
              <textarea
                id={`task-notes-${task.id}`}
                rows={2}
                maxLength={REMARK_LIMIT}
                value={task.notes}
                placeholder="What did you cover? What comes next?"
                onChange={(event) =>
                  updateTask(task.id, { notes: event.target.value })
                }
              />
              <div className="task-metadata">
                <label>
                  Subject
                  <input
                    maxLength={80}
                    placeholder="e.g. React"
                    value={task.subject ?? ""}
                    onChange={(event) =>
                      updateTask(task.id, { subject: event.target.value })
                    }
                  />
                </label>
                <TaskTags
                  task={task}
                  onChange={(tags) => updateTask(task.id, { tags })}
                />
              </div>
              <label className="resource-field">
                Learning resource
                <input
                  type="url"
                  maxLength={2000}
                  placeholder="https://course, article or GitHub link"
                  value={task.resourceUrl ?? ""}
                  onChange={(event) =>
                    updateTask(task.id, { resourceUrl: event.target.value })
                  }
                />
              </label>
              {task.resourceUrl && /^https?:\/\//i.test(task.resourceUrl) && (
                <a
                  className="resource-link"
                  href={task.resourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open resource ↗
                </a>
              )}
            </details>
          </article>
        ))}
      </div>
      {removed && (
        <div className="task-undo" role="status">
          <span>Task removed from this draft.</span>
          <button
            type="button"
            disabled={tasks.length >= TASK_LIMIT}
            onClick={() => {
              const next = [...tasks];
              next.splice(removed.index, 0, removed.task);
              onChange(next);
              setRemoved(null);
            }}
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}
      <button
        type="button"
        className="add-task-button"
        onClick={addTask}
        disabled={tasks.length >= TASK_LIMIT}
      >
        <Plus size={18} />
        {tasks.length ? "Add another task" : "Add your first task"}
      </button>
      {tasks.length >= TASK_LIMIT && (
        <p className="field-help">
          You can add up to {TASK_LIMIT} tasks per day.
        </p>
      )}
      <p className="task-save-hint">
        Add time to each task to calculate your daily learning total
        automatically.
      </p>
    </section>
  );
}

function BookIllustration() {
  return (
    <span className="tasks-empty-icon" aria-hidden="true">
      <ListTodo size={30} />
    </span>
  );
}
function TaskTags({
  task,
  onChange,
}: {
  task: LearningTask;
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState((task.tags ?? []).join(", "));
  return (
    <label>
      Tags (comma separated)
      <input
        maxLength={400}
        placeholder="hooks, practice"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(
            [
              ...new Set(
                event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            ].slice(0, 10),
          );
        }}
      />
    </label>
  );
}
