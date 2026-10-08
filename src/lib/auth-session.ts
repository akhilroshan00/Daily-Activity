import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export function authErrorMessage(error: unknown): string {
  const value = error as {
    code?: string;
    message?: string;
    name?: string;
    status?: number;
  } | null;
  if (value?.code === "email_not_confirmed")
    return "Confirm your email before signing in. Check your inbox and spam folder, or resend the confirmation below.";
  if (value?.code === "invalid_credentials")
    return "The email and password could not be verified. Use the password you registered with, or create an account if you have not signed up.";
  if (
    value?.code === "over_email_send_rate_limit" ||
    value?.code === "over_request_rate_limit" ||
    value?.status === 429 ||
    /too many|rate.?limit/i.test(value?.message ?? "")
  )
    return "Sign-in is temporarily unavailable. Please try again later.";
  if (
    value?.name === "AbortError" ||
    value?.name === "TimeoutError" ||
    /fetch|network|timeout|timed out|abort/i.test(value?.message ?? "")
  )
    return "The connection to sign-in timed out or failed. Check your internet connection and try again.";
  return (
    value?.message || "Unable to verify your session. Please sign in again."
  );
}

type AuthPort = {
  getUser: (
    token?: string,
  ) => Promise<{ data: { user: User | null }; error: unknown }>;
  onAuthStateChange: (
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
};
export type AuthView = {
  user: User | null;
  loading: boolean;
  error?: string;
  resetFields?: boolean;
};

export function observeWorkspaceAuth(
  auth: AuthPort,
  publish: (state: AuthView) => void,
  timeoutMs = 15000,
) {
  let active = true;
  let generation = 0;
  let verifiedId: string | null = null;
  let hadWorkspace = false;
  let checking: string | null = null;
  let sawTransition = false;
  let timer: ReturnType<typeof setTimeout>;
  let pending: ReturnType<typeof setTimeout> | undefined;
  function deadline(ticket: number) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!active || ticket !== generation) return;
      generation++;
      checking = null;
      verifiedId = null;
      publish({
        user: null,
        loading: false,
        error:
          "Sign-in verification timed out. Check your connection and try signing in again.",
      });
    }, timeoutMs);
  }
  publish({ user: null, loading: true });
  deadline(generation);
  const { data } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (event === "INITIAL_SESSION" && sawTransition) return;
    if (event !== "INITIAL_SESSION") sawTransition = true;
    if (event === "SIGNED_OUT" || !session) {
      const resetFields = event === "SIGNED_OUT" && hadWorkspace;
      const interrupted = event === "SIGNED_OUT" && checking !== null;
      generation++;
      clearTimeout(timer);
      clearTimeout(pending);
      checking = null;
      verifiedId = null;
      if (event === "SIGNED_OUT") hadWorkspace = false;
      publish({
        user: null,
        loading: false,
        resetFields,
        ...(interrupted
          ? { error: "Your session ended during sign-in. Please try again." }
          : {}),
      });
      return;
    }
    const identity = `${session.user.id}:${session.access_token}`;
    if (session.user.id === verifiedId || checking === identity) return;
    verifiedId = null;
    checking = identity;
    const ticket = ++generation;
    publish({ user: null, loading: true });
    deadline(ticket);
    clearTimeout(pending);
    pending = setTimeout(async () => {
      try {
        // Verify this event's token directly, without reloading or refreshing
        // the SDK's mutable cached session during the login transition.
        const result = await auth.getUser(session.access_token);
        if (!active || ticket !== generation) return;
        if (result.error) throw result.error;
        if (!result.data.user || result.data.user.id !== session.user.id)
          throw new Error(
            "The account changed during sign-in. Please try again.",
          );
        verifiedId = result.data.user.id;
        hadWorkspace = true;
        publish({ user: result.data.user, loading: false });
      } catch (error) {
        if (!active || ticket !== generation) return;
        verifiedId = null;
        publish({ user: null, loading: false, error: authErrorMessage(error) });
      } finally {
        if (active && ticket === generation) {
          checking = null;
          clearTimeout(timer);
        }
      }
    }, 0);
  });
  return () => {
    active = false;
    generation++;
    clearTimeout(timer);
    clearTimeout(pending);
    data.subscription.unsubscribe();
  };
}
