"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace-auth";
import { Cloud, RefreshCw, LogOut } from "lucide-react";
import { cloudClient } from "@/lib/cloud";
import {
  decodeEntries,
  encodeEntries,
  dateKey,
  type Entries,
} from "@/lib/activity";
import { mergeCloudResult, mergeEntries } from "@/lib/learning";
import { downloadText } from "@/lib/exports";
import type { UpdateEntries } from "./learning-studio";

type CloudRow = { user_id: string; entries: Entries; revision: number };
export default function AccountSync({
  entries,
  updateEntries,
}: {
  entries: Entries;
  updateEntries: UpdateEntries;
}) {
  const { user, signOut } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<CloudRow | null>(null);
  const [prefer, setPrefer] = useState<"existing" | "incoming">("incoming");
  const client = cloudClient();
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function reviewSync() {
    if (!client || !user) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await client
        .from("daylight_workspaces")
        .select("user_id,entries,revision")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!active.current)
        throw new Error("Account changed. Start sync again.");
      const row = data
        ? ({
            ...data,
            entries: decodeEntries(encodeEntries(data.entries)),
          } as CloudRow)
        : { user_id: user.id, entries: {}, revision: 0 };
      setReview(row);
      setPrefer("incoming");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to read cloud data. Your device data is kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function commitSync() {
    if (!client || !review || !user || review.user_id !== user.id) return;
    setBusy(true);
    setMessage("");
    try {
      const identity = await client.auth.getUser();
      if (
        identity.error ||
        identity.data.user?.id !== user.id ||
        !active.current
      )
        throw new Error("Your account changed. Sign in and review sync again.");
      const merged = mergeEntries(entries, review.entries, prefer);
      // The revision check prevents another device's newer changes being overwritten.
      const values = {
        user_id: user.id,
        entries: merged,
        revision: review.revision + 1,
        updated_at: new Date().toISOString(),
      };
      const result =
        review.revision === 0
          ? await client
              .from("daylight_workspaces")
              .insert(values)
              .select("revision")
              .single()
          : await client
              .from("daylight_workspaces")
              .update(values)
              .eq("user_id", user.id)
              .eq("revision", review.revision)
              .select("revision")
              .single();
      if (result.error)
        throw new Error(
          "Cloud data changed or sync could not finish. Review again before retrying. " +
            result.error.message,
        );
      if (!active.current)
        throw new Error(
          "Account changed. Cloud upload finished for the original account; device data has not been merged.",
        );
      downloadText(
        `DAYLIGHT_BEFORE_SYNC_${dateKey(new Date())}.json`,
        encodeEntries(entries),
      );
      const local = updateEntries((latest) =>
        mergeCloudResult(entries, merged, latest),
      );
      if (!local.ok)
        throw new Error(
          "Cloud saved, but device data could not be merged: " + local.message,
        );
      setReview(null);
      setMessage(
        "Synced. Open Daylight on your other device, sign in and sync to retrieve these entries. A safety backup was downloaded.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sync failed. Device data is kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feature-card account-card">
      <div className="feature-heading">
        <Cloud size={20} />
        <h3>Your learning, wherever you are</h3>
      </div>
      {client && (
        <div>
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <p>
            Sync is explicit: review both versions before uploading device data
            to this account. Signing out keeps entries on this device.
          </p>
          <div className="backup-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={reviewSync}
            >
              <RefreshCw size={16} />
              {busy ? "Working…" : "Review sync"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await signOut();
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to sign out.",
                  );
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
          {review && (
            <div className="restore-preview">
              <strong>Review before syncing to {user.email}</strong>
              <p>
                {Object.keys(entries).length} device days ·{" "}
                {Object.keys(review.entries).length} cloud days ·{" "}
                {
                  Object.keys(review.entries).filter(
                    (day) =>
                      entries[day] &&
                      JSON.stringify(entries[day]) !==
                        JSON.stringify(review.entries[day]),
                  ).length
                }{" "}
                dates with differences
              </p>
              <label>
                For dates present on both devices
                <select
                  value={prefer}
                  onChange={(event) =>
                    setPrefer(event.target.value as "existing" | "incoming")
                  }
                >
                  <option value="incoming">Use cloud version</option>
                  <option value="existing">Use this device version</option>
                </select>
              </label>
              <div className="backup-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={commitSync}
                >
                  Merge & sync
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setReview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="feature-message">
          {message}
        </p>
      )}
    </div>
  );
}
