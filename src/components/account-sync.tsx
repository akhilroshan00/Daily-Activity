"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Cloud, RefreshCw, LogOut } from "lucide-react";
import { cloudClient } from "@/lib/cloud";
import {
  decodeEntries,
  encodeEntries,
  dateKey,
  type Entries,
} from "@/lib/activity";
import { mergeEntries } from "@/lib/learning";
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
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<CloudRow | null>(null);
  const [prefer, setPrefer] = useState<"existing" | "incoming">("incoming");
  const client = cloudClient();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReview(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setMessage("");
    try {
      const result = signUp
        ? await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      setMessage(
        signUp && !result.data.session
          ? "Check your email to confirm your account, then sign in here."
          : "Signed in. Review and sync your device data below.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
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
      if (userRef.current?.id !== user.id)
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
      if (userRef.current?.id !== user.id)
        throw new Error(
          "Account changed. Cloud upload finished for the original account; device data has not been merged.",
        );
      downloadText(
        `DAYLIGHT_BEFORE_SYNC_${dateKey(new Date())}.json`,
        encodeEntries(entries),
      );
      const local = updateEntries((latest) => {
        const pending = Object.fromEntries(
          Object.entries(latest).filter(
            ([key, entry]) =>
              JSON.stringify(entry) !== JSON.stringify(entries[key]),
          ),
        );
        return mergeEntries(merged, pending, "incoming");
      });
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
      {!client ? (
        <p>
          Account sync is being connected. Your local learning tools are ready.
        </p>
      ) : !user ? (
        <form className="account-form" onSubmit={authenticate}>
          <p>
            {signUp
              ? "Create a Daylight account to sync across devices."
              : "Sign in to review and sync your learning history."}
          </p>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={signUp ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="backup-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSignUp(!signUp)}
            >
              {signUp ? "Already have an account" : "Create an account"}
            </button>
          </div>
        </form>
      ) : (
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
                const result = await client.auth.signOut();
                if (result.error) setMessage(result.error.message);
                else {
                  setUser(null);
                  setReview(null);
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
