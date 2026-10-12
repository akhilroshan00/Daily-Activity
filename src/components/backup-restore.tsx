"use client";
import { useEffect, useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import {
  decodeEntries,
  encodeEntries,
  dateKey,
  STORAGE_KEY,
  type Entries,
} from "@/lib/activity";
import { mergeEntries } from "@/lib/learning";
import { downloadText } from "@/lib/exports";
import type { UpdateEntries } from "./learning-studio";

export default function BackupRestore({
  entries,
  updateEntries,
  onNotice,
}: {
  entries: Entries;
  updateEntries: UpdateEntries;
  onNotice: (message: string) => void;
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
        parsed = result.entries;
        setWarnings(result.warnings);
        setWorkbookFile(file);
        setDurationSource(source);
      } else parsed = decodeEntries(await file.text());
      setIncoming(parsed);
      setIsWorkbook(workbook);
      setName(file.name);
      setPrefer("existing");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to read this backup.",
      );
    }
  }
  async function restore() {
    if (!incoming) return;
    const merge = isWorkbook
      ? (await import("@/lib/activity-import")).mergeActivityImport
      : (latest: Entries, imported: Entries) =>
          mergeEntries(latest, imported, prefer);
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
            accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              void read(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {incoming && (
        <div className="restore-preview">
          <strong>{name}</strong>
          <p>
            {Object.keys(incoming).length} days ·{" "}
            {Object.values(incoming).reduce(
              (sum, day) => sum + (day.tasks?.length ?? 0),
              0,
            )}{" "}
            tasks · {conflicts.length} existing dates
          </p>
          {isWorkbook ? (
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
          ) : (
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
          )}
          <p>
            {isWorkbook
              ? "New dates and missing tasks are added. Current notes and larger daily totals are kept. Reimporting the same rows skips duplicates. A backup downloads before importing."
              : "New dates are added. Existing dates follow your choice. A safety backup downloads before restoring."}
          </p>
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
