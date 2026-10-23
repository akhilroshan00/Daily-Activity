"use client";

import { useEffect, useRef, useState } from "react";
import { cloudClient } from "@/lib/cloud";
import { changeAccountEmail } from "@/lib/account-email";
import { authErrorMessage } from "@/lib/auth-session";
import { useWorkspace } from "./workspace-auth";

export default function AccountEmail({ disabled }: { disabled: boolean }) {
  const { user } = useWorkspace();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState<{
    email: string;
    pending: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = cloudClient();
    if (!client || pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setChange(null);
    setError("");
    try {
      const result = await changeAccountEmail(
        client.auth,
        user.id,
        email,
        window.location.origin,
        () => active.current,
      );
      if (!active.current) return;
      setEmail("");
      setChange(result);
    } catch (failure) {
      if (active.current) setError(authErrorMessage(failure, "email-change"));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const pendingEmail =
    user.new_email && user.new_email !== user.email ? user.new_email : null;
  const confirmed =
    change && (!change.pending || user.email?.toLowerCase() === change.email);
  const message = !change
    ? ""
    : confirmed
      ? `Your email is now ${change.email}. Use it the next time you sign in. Your saved data stays with this account.`
      : `Email change requested for ${change.email}. Check your current and new inboxes and follow the confirmation links. Keep using your current email until the change is confirmed. Your saved data stays with this account.`;
  return (
    <section className="account-email" aria-labelledby="account-email-heading">
      <h4 id="account-email-heading">Change your email</h4>
      <p>
        Keep your activities, notes, backups and Google connection on this
        account when you change your sign-in email.
      </p>
      {pendingEmail && !change && (
        <p role="status">
          Awaiting confirmation for <strong>{pendingEmail}</strong>. Check your
          current and new inboxes and follow the confirmation links.
        </p>
      )}
      <form className="login-form" onSubmit={submit}>
        <label htmlFor="account-new-email">
          New email address
          <input
            id="account-new-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            disabled={busy || disabled}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
              setChange(null);
            }}
          />
        </label>
        <div>
          <button
            className="secondary-button"
            type="submit"
            disabled={busy || disabled || !email.trim()}
          >
            {busy ? "Requesting change…" : "Change email"}
          </button>
        </div>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
