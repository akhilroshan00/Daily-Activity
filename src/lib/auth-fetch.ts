export function authFetchWithTimeout(
  fetcher: typeof fetch,
  timeoutMs = 12000,
): typeof fetch {
  return async (input, init) => {
    const address =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!new URL(address).pathname.startsWith("/auth/v1/"))
      return fetcher(input, init);
    const controller = new AbortController();
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("Sign-in request timed out", "TimeoutError"),
        ),
      timeoutMs,
    );
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}
