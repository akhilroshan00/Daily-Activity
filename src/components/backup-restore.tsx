"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload, ShieldCheck, Sparkles } from "lucide-react";
import {
  decodeEntries,
  encodeEntries,
  dateKey,
  STORAGE_KEY,
  durationLabel,
  type Entries,
} from "@/lib/activity";
import { mergeEntries } from "@/lib/learning";
import { downloadText } from "@/lib/exports";
import type { UpdateEntries } from "./learning-studio";
import { cloudClient } from "@/lib/cloud";
import { dayTimeTotals, TIME_CATEGORIES } from "@/lib/time-log";

export default function BackupRestore({
  entries,
  updateEntries,
  onNotice,
  userId,
}: {
  entries: Entries;
  updateEntries: UpdateEntries;
  onNotice: (message: string) => void;
  userId: string;
}) {
  const [hasLegacy, setHasLegacy] = useState(false);
  useEffect(() => {
    try {
      setHasLegacy(Boolean(localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* recovery is unavailable when storage cannot be read */
    }
  }, []);
  const [incoming, setIncoming] = useState<Entries | null>(null);
  const [name, setName] = useState("");
  const [prefer, setPrefer] = useState<"existing" | "incoming">("existing");
  const [message, setMessage] = useState("");
  const [isWorkbook, setIsWorkbook] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [durationSource, setDurationSource] = useState<"times" | "hours">(
    "times",
  );
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cancelImport = useCallback(() => {
    generation.current++;
    request.current?.abort();
  }, []);
  useEffect(() => {
    setIncoming(null);
    setBusy(false);
    setMessage("");
    return cancelImport;
  }, [userId, cancelImport]);
  const conflicts = Object.keys(incoming ?? {}).filter((day) =>
    Object.hasOwn(entries, day),
  );
  function backup() {
    downloadText(
      `DAYLIGHT_BACKUP_${dateKey(new Date())}.json`,
      encodeEntries(entries),
    );
  }
  function recoverLegacy() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("No older device log was found.");
      downloadText(
        `DAYLIGHT_OLDER_DEVICE_BACKUP_${dateKey(new Date())}.json`,
        raw,
      );
      setMessage(
        "Older device backup downloaded. Import it only into the account that owns these entries.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to download the older log.",
      );
    }
  }
  async function read(file?: File, source: "times" | "hours" = "times") {
    const ticket = ++generation.current;
    request.current?.abort();
    setBusy(false);
    setAiPreview(false);
    setIncoming(null);
    setMessage("");
    setWarnings([]);
    setWorkbookFile(null);
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(
          "Choose an activity workbook or JSON backup smaller than 5 MB.",
        );
      const workbook = /\.xlsx$/i.test(file.name);
      let parsed: Entries;
      if (workbook) {
        const { parseActivityWorkbook } = await import("@/lib/activity-import");
        const result = parseActivityWorkbook(await file.arrayBuffer(), {
          durationSource: source,
        });
        if (ticket !== generation.current) return;
        parsed = result.entries;
        setWarnings(result.warnings);
        setWorkbookFile(file);
        setDurationSource(source);
      } else parsed = decodeEntries(await file.text());
      if (ticket !== generation.current) return;
      setIncoming(parsed);
      setIsWorkbook(workbook);
      setName(file.name);
      setPrefer("existing");
    } catch (error) {
      if (ticket !== generation.current) return;
      setMessage(
        error instanceof Error ? error.message : "Unable to read this backup.",
      );
    }
  }
  async function readWithAi(file?: File) {
    if (!file) return;
    const ticket = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setIncoming(null);
    setMessage("");
    setWarnings([]);
    setWorkbookFile(null);
    setBusy(true);
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024)
        throw new Error("Choose an Excel .xlsx file smaller than 5 MB.");
      const client = cloudClient();
      const session = await client?.auth.getSession();
      if (
        !client ||
        session?.error ||
        session?.data.session?.user.id !== userId
      )
        throw new Error("Sign in again before importing with AI.");
      const { readAiWorkbook } = await import("@/lib/ai-import-workbook");
      const workbook = readAiWorkbook(await file.arrayBuffer());
      if (ticket !== generation.current) return;
      const response = await fetch("/api/import/excel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify(workbook),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(70000),
        ]),
      });
      const result = await response.json();
      if (ticket !== generation.current) return;
      if (!response.ok)
        throw new Error(result.error || "AI could not read this workbook.");
      const latest = await client.auth.getSession();
      if (ticket !== generation.current) return;
      if (
        latest.error ||
        latest.data.session?.user.id !== userId ||
        result.owner !== userId
      )
        throw new Error(
          "The signed-in account changed. Choose the workbook again.",
        );
      const parsed = decodeEntries(encodeEntries(result.entries));
      setIncoming(parsed);
      setName(file.name);
      setIsWorkbook(true);
      setAiPreview(true);
      setWarnings(Array.isArray(result.warnings) ? result.warnings : []);
      setMessage(
        "Review the dates and times below, then import. Your logs have not changed yet.",
      );
    } catch (error) {
      if (ticket !== generation.current) return;
      setMessage(
        controller.signal.aborted
          ? "AI import cancelled. Your logs are unchanged."
          : error instanceof Error && error.name !== "TimeoutError"
            ? error.message
            : "AI took too long. Try again or use the standard Excel importer.",
      );
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function restore() {
    if (!incoming) return;
    const ticket = generation.current;
    const merge = isWorkbook
      ? (await import("@/lib/activity-import")).mergeActivityImport
      : (latest: Entries, imported: Entries) =>
          mergeEntries(latest, imported, prefer);
    if (ticket !== generation.current) return;
    backup();
    const result = updateEntries((latest) => merge(latest, incoming));
    setMessage(
      result.ok
        ? `${isWorkbook ? "Activities imported" : "Backup restored"}. A copy of your previous data has been downloaded.`
        : result.message,
    );
    if (result.ok) {
      setIncoming(null);
      onNotice(
        isWorkbook
          ? "Activities imported successfully."
          : "Backup restored successfully.",
      );
    }
  }
  return (
    <div className="feature-card backup-card">
      <div className="feature-heading">
        <ShieldCheck size={20} />
        <h3>Your progress, protected</h3>
      </div>
      <p>
        Back up your progress or add activities from an Excel workbook,
        including their times, statuses and remarks.
      </p>
      {hasLegacy && (
        <div className="restore-preview">
          <strong>Older unassigned device log</strong>
          <p>
            Entries from before account login are kept separately. If they
            belong to you, download them and use Choose a backup to import them
            into this workspace.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={recoverLegacy}
          >
            Download older device backup
          </button>
        </div>
      )}
      <div className="backup-actions">
        <button type="button" className="primary-button" onClick={backup}>
          <Download size={16} />
          Download backup
        </button>
        <label className="secondary-button upload-button">
          <Upload size={16} />
          Import Excel or backup
          <input
            type="file"
            disabled={busy}
            accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              void read(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <label className="secondary-button upload-button">
          <Sparkles size={16} />
          Import Excel with AI
          <input
            type="file"
            disabled={busy}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              void readWithAi(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="field-help">
        AI import sends the selected spreadsheet cells to Groq. Review the
        extracted dates and times before adding them to your logs.
      </p>
      {busy && (
        <div className="backup-actions" role="status">
          <span>Reading your Excel file with AI...</span>
          <button
            type="button"
            className="text-button"
            onClick={() => request.current?.abort()}
          >
            Cancel
          </button>
        </div>
      )}
      {incoming && (
        <div className="restore-preview">
          <strong>{name}</strong>
          <p>
            {Object.keys(incoming).length} days ·{" "}
            {Object.values(incoming).reduce(
              (sum, day) => sum + (day.tasks?.length ?? 0),
              0,
            )}{" "}
            activities · {conflicts.length} existing dates
          </p>
          {isWorkbook && !aiPreview ? (
            <label>
              Calculate imported durations from
              <select
                value={durationSource}
                onChange={(event) => {
                  if (workbookFile)
                    void read(
                      workbookFile,
                      event.target.value as "times" | "hours",
                    );
                }}
              >
                <option value="times">Start and end times</option>
                <option value="hours">HRS column</option>
              </select>
            </label>
          ) : !isWorkbook ? (
            <label>
              When a date already exists
              <select
                value={prefer}
                onChange={(event) =>
                  setPrefer(event.target.value as "existing" | "incoming")
                }
              >
                <option value="existing">Keep my current version</option>
                <option value="incoming">Use the backup version</option>
              </select>
            </label>
          ) : null}
          <p>
            {isWorkbook
              ? "New activities are added and matching rows are skipped. Existing notes are kept. Lunch and category rules apply automatically. A backup downloads before importing."
              : "New dates are added. Existing dates follow your choice. A safety backup downloads before restoring."}
          </p>
          {isWorkbook && (
            <details open={aiPreview}>
              <summary>Review extracted activities</summary>
              <ul className="report-task-list">
                {Object.entries(incoming)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, day]) => (
                    <li key={date}>
                      <strong>{date}</strong> · Learning{" "}
                      {durationLabel(dayTimeTotals(day).study)} · Miscellaneous{" "}
                      {durationLabel(dayTimeTotals(day).misc)} · Lunch 1:30-2:30
                      PM
                      <ul>
                        {(day.timeLog?.blocks ?? []).map((block) => (
                          <li key={block.id}>
                            {block.start}-{block.end} ·{" "}
                            {TIME_CATEGORIES[block.category]}
                            {block.topic ? ` · ${block.topic}` : ""}
                          </li>
                        ))}
                      </ul>
                      {!day.timeLog && (
                        <ul>
                          {(day.tasks ?? []).map((task) => (
                            <li key={task.id}>
                              {task.fromTime || "No start time"}-
                              {task.toTime || "No end time"} · {task.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {warnings.length > 0 && (
            <details>
              <summary>{warnings.length} source values to review</summary>
              <ul>
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="backup-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void restore()}
            >
              {isWorkbook ? "Import activities" : "Restore these days"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIncoming(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="feature-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
