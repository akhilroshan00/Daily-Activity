"use client";
import { useState } from "react";
import {
  Check,
  CloudUpload,
  ExternalLink,
  FileSpreadsheet,
  LoaderCircle,
  Plug,
  Unplug,
} from "lucide-react";
import type { useGoogleSync } from "@/hooks/use-google-sync";

export default function GoogleSyncPanel({
  sync,
}: {
  sync: ReturnType<typeof useGoogleSync>;
}) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [replace, setReplace] = useState(false);
  const { status, progress, busy, conflict, canSync } = sync;
  const connected = status?.connected;
  const working = busy || progress.phase === "syncing";
  const summary = !canSync
    ? "Google sync is paused while device storage needs attention."
    : !status
      ? "Checking Google connection…"
      : !status.configured
        ? "Google sync needs a one-time setup for this app."
        : !connected
          ? "Connect a sheet to keep your saved entries in Google."
          : conflict
            ? "A newer Google copy needs your review."
            : !status.autoSync
              ? "Automatic updates are paused."
              : progress.message || "Automatic Google updates are on.";
  return (
    <section
      className="google-sync-panel feature-card"
      aria-labelledby="google-sync-heading"
    >
      <div className="google-sync-summary">
        <div className="google-sync-symbol" aria-hidden="true">
          {working ? (
            <LoaderCircle size={22} className="google-sync-spinner" />
          ) : progress.phase === "synced" ? (
            <Check size={22} />
          ) : (
            <FileSpreadsheet size={22} />
          )}
        </div>
        <div>
          <h2 id="google-sync-heading">Google Sheets &amp; Drive</h2>
          <p role="status" aria-live="polite">
            {summary}
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          aria-expanded={expanded}
          aria-controls="google-sync-controls"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Hide controls"
            : connected
              ? "Manage sync"
              : "Set up sync"}
        </button>
      </div>
      {expanded && (
        <div id="google-sync-controls" className="google-sync-controls">
          {!status?.configured ? (
            <p>
              Google sync is not enabled yet. The app owner needs to finish the
              Google connection setup before accounts can connect their sheets.
            </p>
          ) : !connected ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sync.connect(sheetUrl.trim());
              }}
            >
              <label htmlFor="google-sheet-url">Your Google Sheet link</label>
              <input
                id="google-sheet-url"
                type="url"
                required
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                value={sheetUrl}
                onChange={(event) => setSheetUrl(event.target.value)}
                disabled={busy || !canSync}
                aria-describedby="google-sync-consent"
              />
              <p id="google-sync-consent">
                Connect the Google account that can edit this sheet. Daylight
                creates separate tabs for your days and tasks, keeps existing
                tabs intact, and creates one JSON backup in your Drive. Saved
                changes update both while Daylight is open. Daylight manages
                these tabs; use the app to edit entries.
              </p>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !canSync}
              >
                <Plug size={16} />
                {busy ? "Connecting…" : "Connect Google & enable updates"}
              </button>
            </form>
          ) : (
            <>
              <div className="google-sync-links">
                {status.spreadsheetUrl && (
                  <a
                    href={status.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Google Sheet <ExternalLink size={14} />
                  </a>
                )}
                {status.backupUrl && (
                  <a
                    href={status.backupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Drive backup <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <label className="google-sync-toggle">
                <input
                  type="checkbox"
                  checked={status.autoSync}
                  disabled={working || !canSync}
                  onChange={(event) => {
                    void sync.toggle(event.target.checked);
                  }}
                />
                Automatically update after saving
              </label>
              <p>
                Daily logs, task statuses, notes, holidays and saved focus
                minutes are mirrored. Your Drive backup keeps the complete
                activity data for restoring in Daylight. Unsaved drafts, colour
                preferences, weekly goals and running timers stay on this
                device.
              </p>
              {conflict && (
                <div className="restore-preview">
                  <strong>Review the Google copy first</strong>
                  <p>
                    Another device has updated Google, or this device has not
                    synced before. Open the sheet and keep any entries you need
                    before replacing the Daylight tabs and backup with this
                    device&apos;s full log.
                  </p>
                  <label className="google-sync-toggle">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(event) => setReplace(event.target.checked)}
                      disabled={working}
                    />
                    I reviewed the Google copy and want to use this
                    device&apos;s entries.
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!replace || working || !canSync}
                    onClick={() => {
                      setReplace(false);
                      void sync.useDevice();
                    }}
                  >
                    Use this device&apos;s entries
                  </button>
                </div>
              )}
              <div className="backup-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={working || conflict || !canSync}
                  onClick={sync.retry}
                >
                  <CloudUpload size={16} />
                  Sync now
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={working || !canSync}
                  onClick={() => {
                    void sync.disconnect();
                  }}
                >
                  <Unplug size={16} />
                  Disconnect Google
                </button>
              </div>
              {status.lastSyncedAt && (
                <p>
                  Last saved to both Google files:{" "}
                  {new Date(status.lastSyncedAt).toLocaleString()}
                </p>
              )}
            </>
          )}
          {sync.message && (
            <p className="login-error" role="alert">
              {sync.message}
            </p>
          )}
          {progress.phase === "error" && (
            <p className="login-error" role="alert">
              {progress.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
