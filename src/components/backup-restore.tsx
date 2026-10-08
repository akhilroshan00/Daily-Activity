"use client";
import { useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import {
  decodeEntries,
  encodeEntries,
  dateKey,
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
  const [incoming, setIncoming] = useState<Entries | null>(null);
  const [name, setName] = useState("");
  const [prefer, setPrefer] = useState<"existing" | "incoming">("existing");
  const [message, setMessage] = useState("");
  const conflicts = Object.keys(incoming ?? {}).filter((day) =>
    Object.hasOwn(entries, day),
  );
  function backup() {
    downloadText(
      `DAYLIGHT_BACKUP_${dateKey(new Date())}.json`,
      encodeEntries(entries),
    );
  }
  async function read(file?: File) {
    setIncoming(null);
    setMessage("");
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a JSON backup smaller than 5 MB.");
      const parsed = decodeEntries(await file.text());
      setIncoming(parsed);
      setName(file.name);
      setPrefer("existing");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to read this backup.",
      );
    }
  }
  function restore() {
    if (!incoming) return;
    backup();
    const result = updateEntries((latest) =>
      mergeEntries(latest, incoming, prefer),
    );
    setMessage(
      result.ok
        ? "Backup restored. A copy of your previous data has been downloaded."
        : result.message,
    );
    if (result.ok) {
      setIncoming(null);
      onNotice("Backup restored successfully.");
    }
  }
  return (
    <div className="feature-card backup-card">
      <div className="feature-heading">
        <ShieldCheck size={20} />
        <h3>Your progress, protected</h3>
      </div>
      <p>
        Keep a portable copy of every day, task, note and learning resource.
      </p>
      <div className="backup-actions">
        <button type="button" className="primary-button" onClick={backup}>
          <Download size={16} />
          Download backup
        </button>
        <label className="secondary-button upload-button">
          <Upload size={16} />
          Choose a backup
          <input
            type="file"
            accept=".json,application/json"
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
          <p>
            New dates are added. Existing dates follow your choice. A safety
            backup downloads before restoring.
          </p>
          <div className="backup-actions">
            <button type="button" className="primary-button" onClick={restore}>
              Restore these days
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
