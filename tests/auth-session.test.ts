import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  observeWorkspaceAuth,
  authErrorMessage,
  authRedirectError,
  type AuthView,
} from "../src/lib/auth-session";
import { authFetchWithTimeout } from "../src/lib/auth-fetch";

const alice: User = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-08T00:00:00Z",
};
const bob: User = { ...alice, id: "22222222-2222-4222-8222-222222222222" };
const session = (user: User, token = user.id): Session => ({
  user,
  access_token: token,
  refresh_token: "test-refresh",
  expires_in: 3600,
  token_type: "bearer",
});
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function fixture(timeout = 1000) {
  let listener: (
    event: AuthChangeEvent,
    session: Session | null,
  ) => void = () => {};
  const calls: {
    token?: string;
    resolve: (result: { data: { user: User | null }; error: unknown }) => void;
  }[] = [];
  const states: AuthView[] = [];
  const auth = {
    getUser: (token?: string) =>
      new Promise<{ data: { user: User | null }; error: unknown }>((resolve) =>
        calls.push({ token, resolve }),
      ),
    onAuthStateChange: (callback: typeof listener) => {
      listener = callback;
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listener = () => {};
            },
          },
        },
      };
    },
  };
  const stop = observeWorkspaceAuth(
    auth,
    (state) => states.push(state),
    timeout,
  );
  return {
    calls,
    states,
    stop,
    emit: (event: AuthChangeEvent, value: Session | null) =>
      listener(event, value),
  };
}

test("switching back to a previously verified account cancels the intervening account check", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  f.emit("SIGNED_IN", session(bob));
  await tick();
  f.emit("SIGNED_IN", session(alice));
  await tick();
  assert.equal(f.calls.length, 3);
  f.calls[1].resolve({ data: { user: bob }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user, null);
  f.calls[2].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user?.id, alice.id);
});
test("a stalled initial auth event gives the login form back instead of leaving a permanent loading screen", async (t) => {
  const f = fixture(20);
  t.after(f.stop);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(f.states.at(-1)?.loading, false);
  assert.equal(f.states.at(-1)?.user, null);
  assert.match(f.states.at(-1)?.error ?? "", /timed out/);
});
test("repeated sign-in events verify once and stale initial-session events cannot return a successful login to the form", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  for (let n = 0; n < 5; n++) f.emit("SIGNED_IN", session(alice));
  f.emit("INITIAL_SESSION", null);
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].token, alice.id);
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user?.id, alice.id);
  assert.equal(f.states.at(-1)?.loading, false);
  f.emit("TOKEN_REFRESHED", session(alice, "new-token"));
  assert.equal(f.states.at(-1)?.user?.id, alice.id);
  assert.equal(f.calls.length, 1);
});
test("a late verification for the previous account cannot open its workspace after switching accounts or signing out", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.emit("SIGNED_IN", session(bob));
  await tick();
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user, null);
  assert.equal(f.states.at(-1)?.loading, true);
  f.calls[1].resolve({ data: { user: bob }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user?.id, bob.id);
  f.emit("SIGNED_OUT", null);
  assert.equal(f.states.at(-1)?.user, null);
  assert.equal(f.states.at(-1)?.resetFields, true);
});
test("missing initial sessions preserve typed fields and verification failures display a usable error", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("INITIAL_SESSION", null);
  assert.equal(f.states.at(-1)?.resetFields, false);
  assert.equal(f.states.at(-1)?.loading, false);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.calls[0].resolve({
    data: { user: null },
    error: { code: "email_not_confirmed" },
  });
  await flush();
  assert.equal(f.states.at(-1)?.loading, false);
  assert.match(f.states.at(-1)?.error ?? "", /Confirm your email/);
  assert.equal(f.states.at(-1)?.user, null);
});
test("stalled session verification stops loading and ignores a late result", async (t) => {
  const f = fixture(20);
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(f.states.at(-1)?.loading, false);
  assert.match(f.states.at(-1)?.error ?? "", /timed out/);
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.user, null);
});
test("unmounting the auth observer prevents a pending verification from changing the workspace", async () => {
  const f = fixture();
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.stop();
  const count = f.states.length;
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.states.length, count);
});
test("credential and request-limit errors describe the action without assuming an account exists", () => {
  assert.match(
    authErrorMessage({ code: "invalid_credentials" }),
    /email and password could not be verified/,
  );
  for (const error of [
    { code: "over_request_rate_limit" },
    { status: 429, message: "Too many attempts" },
  ]) {
    assert.equal(
      authErrorMessage(error),
      "Sign-in is temporarily paused. Please try again later.",
    );
  }
  assert.match(
    authErrorMessage({ status: 429 }, "signup"),
    /^Account creation/,
  );
  assert.match(
    authErrorMessage({ status: 429 }, "resend"),
    /^Confirmation requests/,
  );
  assert.match(
    authErrorMessage({ status: 429 }, "session"),
    /^Session verification/,
  );
});
test("email quota failures are not reported as password sign-in outages, even with HTTP 429", () => {
  for (const error of [
    { code: "over_email_send_rate_limit", status: 429 },
    { message: "Email rate limit exceeded", status: 429 },
  ]) {
    for (const action of ["signup", "resend", "login"] as const) {
      const message = authErrorMessage(error, action);
      assert.match(message, /^Confirmation emails are temporarily unavailable/);
      assert.match(message, /earlier confirmation link/);
      assert.match(message, /already confirmed, use Sign in/);
      assert.doesNotMatch(message, /Sign-in is temporarily|Too many attempts/);
    }
  }
});
test("server verification throttling closes the loading screen with a session-specific error", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.calls[0].resolve({
    data: { user: null },
    error: { code: "over_request_rate_limit", status: 429 },
  });
  await flush();
  assert.equal(f.states.at(-1)?.loading, false);
  assert.equal(f.states.at(-1)?.user, null);
  assert.match(f.states.at(-1)?.error ?? "", /^Session verification/);
});
test("authentication requests are aborted on timeout while database requests keep their original signal", async () => {
  const stalled: typeof fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  await assert.rejects(
    authFetchWithTimeout(stalled, 5)("https://example.com/auth/v1/token"),
    /timed out/,
  );
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  const passthrough: typeof fetch = async (_input, init) => {
    received = init?.signal;
    return new Response("{}");
  };
  await authFetchWithTimeout(passthrough)(
    "https://example.com/rest/v1/daylight_workspaces",
    { signal: controller.signal },
  );
  assert.equal(received, controller.signal);
});

test("recovery arriving during initial verification opens password recovery for the verified account", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("INITIAL_SESSION", session(alice));
  await tick();
  f.emit("PASSWORD_RECOVERY", session(alice));
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.states.at(-1)?.recovery, true);
  assert.equal(f.states.at(-1)?.user?.id, alice.id);
});

test("recovery for an already verified account is not discarded by event deduplication", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("SIGNED_IN", session(alice));
  await tick();
  f.calls[0].resolve({ data: { user: alice }, error: null });
  await flush();
  f.emit("PASSWORD_RECOVERY", session(alice));
  assert.equal(f.states.at(-1)?.recovery, true);
  f.emit("SIGNED_OUT", null);
  f.emit("SIGNED_IN", session(bob));
  await tick();
  f.calls[1].resolve({ data: { user: bob }, error: null });
  await flush();
  assert.equal(f.states.at(-1)?.recovery, false);
});

test("failed recovery verification cannot open a password form or workspace", async (t) => {
  const f = fixture();
  t.after(f.stop);
  f.emit("PASSWORD_RECOVERY", session(alice));
  await tick();
  f.calls[0].resolve({
    data: { user: null },
    error: { message: "Invalid token" },
  });
  await flush();
  assert.equal(f.states.at(-1)?.user, null);
  assert.notEqual(f.states.at(-1)?.recovery, true);
});

test("email redirect errors explain expired links and do not echo untrusted descriptions", () => {
  for (const url of [
    "https://daylight.test/#error=access_denied&error_code=otp_expired",
    "https://daylight.test/?error_code=otp_expired",
  ]) {
    assert.match(authRedirectError(url) ?? "", /expired or was already used/);
    assert.match(authRedirectError(url) ?? "", /Forgot password/);
  }
  assert.equal(
    authRedirectError("https://daylight.test/?google=connected"),
    null,
  );
  const result = authRedirectError(
    "https://daylight.test/#error=denied&error_description=attacker-text",
  );
  assert.match(result ?? "", /could not be verified/);
  assert.doesNotMatch(result ?? "", /attacker-text/);
});

test("password recovery email quota and throttling are described for the reset action", () => {
  assert.match(
    authErrorMessage(
      { code: "over_email_send_rate_limit", status: 429 },
      "recovery",
    ),
    /^Password reset emails/,
  );
  assert.match(
    authErrorMessage({ status: 429 }, "recovery"),
    /^Password reset requests/,
  );
});
