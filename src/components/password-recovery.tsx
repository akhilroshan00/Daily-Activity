"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authErrorMessage } from "@/lib/auth-session";

export default function PasswordRecovery({
  client,
  onSaved,
  onCancel,
}: {
  client: SupabaseClient;
  onSaved: () => void;
  onCancel: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmation("");
      onSaved();
    } catch (error) {
      setError(authErrorMessage(error, "recovery"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <h2 id="auth-heading">Choose a new password</h2>
      <p>
        Your reset link is verified. Save a new password to open your workspace.
      </p>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="new-password">
          New password
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label htmlFor="confirm-password">
          Confirm password
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button
          className="primary-button auth-submit"
          disabled={busy}
          type="submit"
        >
          {busy ? "Saving…" : "Save password and open workspace"}
        </button>
        <button
          className="text-button"
          disabled={busy}
          type="button"
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            try {
              await onCancel();
            } catch (error) {
              setError(authErrorMessage(error));
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          Cancel and sign out
        </button>
      </form>
    </>
  );
}
