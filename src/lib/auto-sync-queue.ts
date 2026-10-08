export type SyncProgress = {
  phase: "idle" | "pending" | "syncing" | "synced" | "error";
  message: string;
  lastSyncedAt?: string;
};

export class SyncFailure extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

// Keep a single request in flight. An edit during upload becomes the next
// snapshot, rather than allowing an older response to overwrite newer data.
export function createAutoSyncQueue(
  send: (
    snapshot: string,
    signal: AbortSignal,
  ) => Promise<{ lastSyncedAt: string }>,
  publish: (progress: SyncProgress) => void,
  { debounceMs = 1200, retryMs = 5000, maxRetries = 3 } = {},
) {
  let enabled = false;
  let disposed = false;
  let latest: string | undefined;
  let acknowledged: string | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let manual = false;

  function schedule(delay: number) {
    clearTimeout(timer);
    if (disposed || controller || !enabled || latest === acknowledged) return;
    publish({
      phase: "pending",
      message: "Saved on this device. Google update queued.",
    });
    timer = setTimeout(() => {
      void run();
    }, delay);
  }

  async function run() {
    clearTimeout(timer);
    if (disposed || controller || (!enabled && !manual) || latest === undefined)
      return;
    if (latest === acknowledged && !manual) {
      manual = false;
      return;
    }
    const snapshot = latest;
    manual = false;
    const current = new AbortController();
    controller = current;
    publish({ phase: "syncing", message: "Updating Google Sheets and Drive…" });
    let delay: number | undefined;
    try {
      const result = await send(snapshot, current.signal);
      if (disposed || current.signal.aborted) return;
      acknowledged = snapshot;
      attempts = 0;
      publish({
        phase: "synced",
        message: "Saved to Google Sheets and Drive.",
        ...result,
      });
      if (latest !== acknowledged) delay = debounceMs;
    } catch (error) {
      if (disposed || current.signal.aborted) return;
      // One target may have accepted the failed upload. Even a previously
      // acknowledged snapshot needs to be sent again if the user reverts to it.
      acknowledged = undefined;
      const message =
        error instanceof Error
          ? error.message
          : "Google sync failed. Your device data is kept.";
      const retry =
        enabled &&
        error instanceof SyncFailure &&
        error.retryable &&
        attempts < maxRetries;
      if (retry) delay = retryMs * 2 ** attempts++;
      publish({
        phase: "error",
        message: retry ? `${message} Retrying automatically.` : message,
      });
    } finally {
      if (controller === current) controller = undefined;
      if (!disposed && delay !== undefined) schedule(delay);
    }
  }

  return {
    setSnapshot(snapshot: string) {
      if (disposed || latest === snapshot) return;
      latest = snapshot;
      attempts = 0;
      schedule(debounceMs);
    },
    setEnabled(value: boolean) {
      if (disposed || enabled === value) return;
      enabled = value;
      if (value) schedule(debounceMs);
      else clearTimeout(timer);
    },
    acknowledge(snapshot: string) {
      if (disposed || controller) return;
      acknowledged = snapshot;
      if (latest === snapshot) clearTimeout(timer);
    },
    retry() {
      if (disposed) return;
      attempts = 0;
      manual = true;
      void run();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
