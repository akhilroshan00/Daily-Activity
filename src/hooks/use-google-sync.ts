"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Entries } from "@/lib/activity";
import { buildGoogleBackup } from "@/lib/google-data";
import { cloudClient } from "@/lib/cloud";
import {
  createAutoSyncQueue,
  SyncFailure,
  type SyncProgress,
} from "@/lib/auto-sync-queue";

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  autoSync: boolean;
  spreadsheetUrl?: string | null;
  backupUrl?: string | null;
  lastSyncedAt?: string | null;
  revision?: number;
  snapshotHash?: string | null;
};
type Acknowledgement = { revision: number; snapshotHash: string };
type SyncResult = Acknowledgement & {
  lastSyncedAt: string;
  spreadsheetUrl?: string;
  backupUrl?: string;
};

async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function useGoogleSync(
  userId: string,
  entries: Entries,
  canSync: boolean,
) {
  const client = cloudClient();
  const snapshot = useMemo(() => buildGoogleBackup(entries), [entries]);
  const snapshotRef = useRef(snapshot);
  const allowedRef = useRef(canSync);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const statusRef = useRef<GoogleStatus | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({
    phase: "idle",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const revisionRef = useRef(0);
  const queue = useRef<ReturnType<typeof createAutoSyncQueue> | null>(null);
  const actions = useRef<{
    connect: (url: string) => Promise<void>;
    disconnect: () => Promise<void>;
    toggle: (enabled: boolean) => Promise<void>;
    useDevice: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    allowedRef.current = canSync;
    queue.current?.setSnapshot(snapshot);
    queue.current?.setEnabled(
      Boolean(
        canSync &&
        statusRef.current?.connected &&
        statusRef.current.autoSync &&
        !conflictRef.current,
      ),
    );
  }, [snapshot, canSync]);

  useEffect(() => {
    if (!client || !canSync) return;
    let active = true;
    let acting = false;
    const abort = new AbortController();
    const key = `daylight.google-sync.v1:${userId}`;

    async function request<T>(
      path: string,
      method = "GET",
      body?: unknown,
      signal = abort.signal,
    ): Promise<T> {
      const { data, error } = await client!.auth.getSession();
      if (error || data.session?.user.id !== userId || !active)
        throw new SyncFailure(
          "Your account changed. Sign in again before connecting Google.",
        );
      if (!navigator.onLine)
        throw new SyncFailure(
          "You're offline. Your entries are saved on this device.",
          true,
        );
      let response: Response;
      try {
        response = await fetch(`/api/google/${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            ...(body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "same-origin",
          signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
          cache: "no-store",
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new SyncFailure(
          "Google sync could not connect. Your device data is kept.",
          true,
        );
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.code === "SYNC_CONFLICT" && active) {
          conflictRef.current = true;
          setConflict(true);
          queue.current?.setEnabled(false);
        }
        throw new SyncFailure(
          result.error ||
            "Google sync could not finish. Your device data is kept.",
          result.code !== "SYNC_CONFLICT" &&
            (response.status === 409 ||
              response.status === 429 ||
              response.status >= 500),
        );
      }
      return result as T;
    }

    function record(ack: Acknowledgement) {
      revisionRef.current = ack.revision;
      try {
        localStorage.setItem(key, JSON.stringify(ack));
      } catch {
        /* server hash still detects an identical copy next time */
      }
    }

    const worker = createAutoSyncQueue(
      async (value, signal) => {
        if (!allowedRef.current || conflictRef.current)
          throw new SyncFailure(
            "Sync is paused until your device data is ready for review.",
          );
        const decoded = JSON.parse(value) as { entries: Entries };
        const result = await request<SyncResult>(
          "sync",
          "POST",
          { entries: decoded.entries, expectedRevision: revisionRef.current },
          signal,
        );
        if (active) {
          record(result);
          const next = { ...statusRef.current!, ...result };
          statusRef.current = next;
          setStatus(next);
        }
        return result;
      },
      (value) => {
        if (active) setProgress(value);
      },
    );
    queue.current = worker;
    worker.setSnapshot(snapshotRef.current);

    async function refresh() {
      const next = await request<GoogleStatus>("status");
      if (!active) return;
      statusRef.current = next;
      setStatus(next);
      if (!next.connected) {
        worker.setEnabled(false);
        return;
      }
      const comparedSnapshot = snapshotRef.current;
      const currentHash = await digest(comparedSnapshot);
      if (!active) return;
      let previous: Acknowledgement | null = null;
      try {
        previous = JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        /* first connection on this device */
      }
      const remoteRevision = next.revision ?? 0;
      if (next.snapshotHash === currentHash) {
        record({ revision: remoteRevision, snapshotHash: currentHash });
        worker.acknowledge(comparedSnapshot);
        conflictRef.current = false;
        setConflict(false);
      } else if (remoteRevision > 0 && previous?.revision !== remoteRevision) {
        conflictRef.current = true;
        setConflict(true);
        setProgress({
          phase: "error",
          message:
            "Google has a newer copy. Review the sheet before replacing it with this device's entries.",
        });
      } else {
        revisionRef.current = remoteRevision;
        conflictRef.current = false;
        setConflict(false);
      }
      worker.setEnabled(
        Boolean(next.autoSync && allowedRef.current && !conflictRef.current),
      );
    }

    async function action(work: () => Promise<void>) {
      if (acting || !active) return;
      acting = true;
      setBusy(true);
      setMessage("");
      try {
        await work();
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to update your Google connection.",
          );
      } finally {
        acting = false;
        if (active) setBusy(false);
      }
    }
    actions.current = {
      connect: (url) =>
        action(async () => {
          const result = await request<{ url: string }>("connect", "POST", {
            spreadsheetUrl: url,
          });
          if (active) window.location.assign(result.url);
        }),
      disconnect: () =>
        action(async () => {
          worker.setEnabled(false);
          try {
            await request("connect", "DELETE");
          } catch (error) {
            worker.setEnabled(
              Boolean(
                statusRef.current?.connected &&
                statusRef.current.autoSync &&
                allowedRef.current &&
                !conflictRef.current,
              ),
            );
            throw error;
          }
          if (!active) return;
          conflictRef.current = false;
          setConflict(false);
          await refresh();
          setProgress({
            phase: "idle",
            message: "Disconnected. Your Google files have been kept.",
          });
        }),
      toggle: (enabled) =>
        action(async () => {
          await request("status", "PATCH", { autoSync: enabled });
          if (active) await refresh();
        }),
      useDevice: () =>
        action(async () => {
          const next = await request<GoogleStatus>("status");
          if (!active || !next.connected)
            throw new SyncFailure("Connect Google before uploading entries.");
          revisionRef.current = next.revision ?? 0;
          statusRef.current = next;
          setStatus(next);
          conflictRef.current = false;
          setConflict(false);
          worker.setEnabled(Boolean(next.autoSync && allowedRef.current));
          worker.retry();
        }),
    };
    void refresh().catch((error) => {
      if (active)
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to check Google sync.",
        );
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has("google_sync")) {
      if (params.get("google_sync") === "error")
        setMessage(
          "Google connection did not finish. Check the setup and try connecting again.",
        );
      params.delete("google_sync");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
    const online = () => {
      if (statusRef.current?.autoSync && !conflictRef.current) worker.retry();
    };
    window.addEventListener("online", online);
    return () => {
      active = false;
      worker.dispose();
      abort.abort();
      window.removeEventListener("online", online);
      if (queue.current === worker) queue.current = null;
      actions.current = null;
    };
  }, [client, userId, canSync]);

  return {
    status,
    progress,
    busy,
    message,
    conflict,
    canSync,
    connect: (url: string) => actions.current?.connect(url),
    disconnect: () => actions.current?.disconnect(),
    toggle: (enabled: boolean) => actions.current?.toggle(enabled),
    retry: () => {
      if (!conflictRef.current && canSync) queue.current?.retry();
    },
    useDevice: () => actions.current?.useDevice(),
  };
}
