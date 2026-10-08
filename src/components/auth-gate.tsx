"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { cloudClient } from "@/lib/cloud";
import {
  observeWorkspaceAuth,
  authErrorMessage,
  authRedirectError,
} from "@/lib/auth-session";
import CalendarApp from "./calendar-app";
import BrandIcon, { BrandMotion } from "./brand-icon";
import { WorkspaceAuth } from "./workspace-auth";
import PasswordRecovery from "./password-recovery";

export default function AuthGate() {
  const client = cloudClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestInFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const redirectError = authRedirectError(window.location.href);
    if (redirectError) {
      setMessage(redirectError);
      setMessageError(true);
    }
    if (!client) {
      setLoading(false);
      return;
    }
    return observeWorkspaceAuth(client.auth, (state) => {
      setUser(state.user);
      setLoading(state.loading);
      let recovering = Boolean(state.recovery);
      try {
        const saved = sessionStorage.getItem("daylight.password-recovery");
        if (state.user) {
          recovering ||= saved === state.user.id;
          if (recovering)
            sessionStorage.setItem("daylight.password-recovery", state.user.id);
          else if (saved)
            sessionStorage.removeItem("daylight.password-recovery");
        } else if (state.resetFields) {
          sessionStorage.removeItem("daylight.password-recovery");
        }
      } catch {
        /* Recovery still works when browser storage is unavailable. */
      }
      setRecovery(recovering);
      if (state.error) {
        setMessage(state.error);
        setMessageError(true);
      }
      if (state.resetFields) {
        setPassword("");
        setEmail("");
        setName("");
        setVisible(false);
        setMode("login");
        setNeedsConfirmation(false);
      }
    });
  }, [client]);

  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    if (!client || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      if (mode === "signup" && !name.trim())
        throw new Error("Enter your name to create an account.");
      const result =
        mode === "signup"
          ? await client.auth.signUp({
              email: email.trim(),
              password,
              options: {
                emailRedirectTo: window.location.origin,
                data: { display_name: name.trim() },
              },
            })
          : await client.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
      if (result.error) throw result.error;
      if (mode === "login" && !result.data.session)
        throw new Error("No sign-in session was created. Please try again.");
      setPassword("");
      setVisible(false);
      if (mode === "signup" && !result.data.session) {
        setMode("login");
        setNeedsConfirmation(true);
        setMessage(
          "Check your inbox and spam folder for a confirmation link, then sign in. If you already have an account, use your existing password.",
        );
      }
    } catch (error) {
      setMessage(authErrorMessage(error, mode));
      setMessageError(true);
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "email_not_confirmed"
      )
        setNeedsConfirmation(true);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  async function resendConfirmation() {
    if (!client || requestInFlight.current) return;
    const field = document.getElementById(
      "login-email",
    ) as HTMLInputElement | null;
    if (!field?.reportValidity()) return;
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setMessage(
        "Confirmation email requested. Check your inbox and spam folder, open the latest link, then sign in here.",
      );
    } catch (error) {
      setMessage(authErrorMessage(error, "resend"));
      setMessageError(true);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  async function requestPasswordReset() {
    if (!client || requestInFlight.current) return;
    const field = document.getElementById(
      "login-email",
    ) as HTMLInputElement | null;
    if (!field?.reportValidity()) return;
    requestInFlight.current = true;
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage(
        "If this address has an account, check your inbox and spam folder for a password reset email. Open the newest link once, then choose a new password.",
      );
    } catch (error) {
      setMessage(authErrorMessage(error, "recovery"));
      setMessageError(true);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    setUser(null);
    setRecovery(false);
    try {
      sessionStorage.removeItem("daylight.password-recovery");
    } catch {}
    setPassword("");
    setName("");
    setEmail("");
    setMode("login");
    setNeedsConfirmation(false);
    setMessageError(false);
    setMessage("Signed out. Sign in to open your own workspace.");
  }
  if (loading)
    return (
      <div className="loading-shell" role="status">
        <BrandIcon size={38} animated />
        <strong>daylight.</strong>
        <span>Checking your session…</span>
      </div>
    );
  if (user && !recovery)
    return (
      <WorkspaceAuth.Provider value={{ user, signOut }}>
        <CalendarApp key={user.id} />
      </WorkspaceAuth.Provider>
    );
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Welcome to Daylight">
        <div className="auth-brand">
          <BrandIcon size={27} /> daylight.
        </div>
        <span className="eyebrow">YOUR OWN SPACE TO GROW</span>
        <h1>
          Small steps.
          <br />
          <em>Your progress.</em>
        </h1>
        <p>
          Plan your days, track what you learn and turn everyday effort into a
          year of growth.
        </p>
        <BrandMotion />
        <div className="auth-private">
          <LockKeyhole size={18} /> A separate workspace for every account
        </div>
      </section>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-form-card">
          <span className="auth-kicker">WELCOME TO DAYLIGHT</span>
          {recovery && user && client ? (
            <PasswordRecovery
              client={client}
              onSaved={() => {
                try {
                  sessionStorage.removeItem("daylight.password-recovery");
                } catch {}
                setRecovery(false);
              }}
              onCancel={signOut}
            />
          ) : (
            <>
              <h2 id="auth-heading">
                {mode === "signup" ? "Start your journey" : "Welcome back"}
              </h2>
              <p>
                {mode === "signup"
                  ? "Create your account for your own tasks, notes and learning history."
                  : "Sign in to open your personal learning planner."}
              </p>
              {!client ? (
                <p className="form-error" role="alert">
                  Sign-in is not configured. Set the public Supabase URL and
                  publishable key, then restart the app.
                </p>
              ) : (
                <>
                  <div
                    className="auth-mode"
                    role="group"
                    aria-label="Account action"
                  >
                    <button
                      type="button"
                      aria-pressed={mode === "login"}
                      disabled={busy}
                      onClick={() => {
                        if (mode === "login") return;
                        setMode("login");
                        setPassword("");
                        setVisible(false);
                        setMessage("");
                        setMessageError(false);
                        setNeedsConfirmation(false);
                      }}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === "signup"}
                      disabled={busy}
                      onClick={() => {
                        if (mode === "signup") return;
                        setMode("signup");
                        setPassword("");
                        setVisible(false);
                        setMessage("");
                        setMessageError(false);
                        setNeedsConfirmation(false);
                      }}
                    >
                      Create account
                    </button>
                  </div>
                  {message && (
                    <p
                      id="login-message"
                      className={
                        messageError ? "login-error" : "feature-message"
                      }
                      role={messageError ? "alert" : "status"}
                    >
                      {message}
                    </p>
                  )}
                  <form onSubmit={authenticate} className="login-form">
                    {mode === "signup" && (
                      <label>
                        Your name
                        <input
                          autoComplete="name"
                          required
                          maxLength={80}
                          value={name}
                          disabled={busy}
                          onChange={(event) => setName(event.target.value)}
                        />
                      </label>
                    )}
                    <label htmlFor="login-email">
                      Email address
                      <div className="auth-input">
                        <Mail size={18} aria-hidden="true" />
                        <input
                          id="login-email"
                          type="email"
                          name="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          value={email}
                          disabled={busy}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setNeedsConfirmation(false);
                            setMessage("");
                            setMessageError(false);
                          }}
                          placeholder="you@example.com"
                        />
                      </div>
                    </label>
                    <label htmlFor="login-password">
                      Password
                      <div className="auth-input">
                        <LockKeyhole size={18} aria-hidden="true" />
                        <input
                          id="login-password"
                          type={visible ? "text" : "password"}
                          name="password"
                          autoComplete={
                            mode === "signup"
                              ? "new-password"
                              : "current-password"
                          }
                          required
                          minLength={mode === "signup" ? 8 : undefined}
                          value={password}
                          disabled={busy}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={
                            mode === "signup"
                              ? "At least 8 characters"
                              : "Enter your password"
                          }
                        />
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={
                            visible ? "Hide password" : "Show password"
                          }
                          aria-pressed={visible}
                          onClick={() => setVisible(!visible)}
                        >
                          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </label>
                    <button
                      className="primary-button auth-submit"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? "Please wait…"
                        : mode === "signup"
                          ? "Create my account"
                          : "Open my workspace"}
                      <ArrowRight size={18} />
                    </button>
                  </form>
                  {mode === "login" && (
                    <div className="auth-help">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={requestPasswordReset}
                      >
                        Forgot password?
                      </button>
                      <p>
                        Enter your email above to request a secure reset link.
                        Signing up again does not reset an existing password.
                      </p>
                    </div>
                  )}
                  {needsConfirmation && (
                    <div className="auth-help">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={resendConfirmation}
                      >
                        Resend confirmation email
                      </button>
                      <p>
                        Confirm the same email address you entered above before
                        signing in.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <p className="auth-footnote">
            Your tasks, daily inputs, focus timer and weekly goal belong to your
            account. Use Account &amp; sync inside your workspace to move
            entries between devices.
          </p>
        </div>
      </section>
    </main>
  );
}
