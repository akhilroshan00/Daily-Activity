import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createAutoSyncQueue,
  SyncFailure,
  type SyncProgress,
} from "../src/lib/auto-sync-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test("rapid edits coalesce and an edit during upload is sent only after the older upload finishes", async (t) => {
  const calls: {
    value: string;
    resolve: (value: { lastSyncedAt: string }) => void;
  }[] = [];
  const states: SyncProgress[] = [];
  const queue = createAutoSyncQueue(
    (value) => new Promise((resolve) => calls.push({ value, resolve })),
    (value) => states.push(value),
    { debounceMs: 1 },
  );
  t.after(queue.dispose);
  queue.setEnabled(true);
  queue.setSnapshot("first");
  queue.setSnapshot("second");
  await tick();
  assert.deepEqual(
    calls.map((call) => call.value),
    ["second"],
  );
  queue.setSnapshot("third");
  await tick();
  assert.equal(calls.length, 1);
  calls[0].resolve({ lastSyncedAt: "2026-10-08T10:00:00Z" });
  await tick();
  assert.deepEqual(
    calls.map((call) => call.value),
    ["second", "third"],
  );
  calls[1].resolve({ lastSyncedAt: "2026-10-08T10:00:02Z" });
  await tick();
  queue.setSnapshot("third");
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(states.at(-1)?.phase, "synced");
});

test("retryable failures retain the latest snapshot and stop after bounded retries", async (t) => {
  let calls = 0;
  const states: SyncProgress[] = [];
  const queue = createAutoSyncQueue(
    async () => {
      calls++;
      throw new SyncFailure("Offline.", true);
    },
    (value) => states.push(value),
    { debounceMs: 1, retryMs: 1, maxRetries: 1 },
  );
  t.after(queue.dispose);
  queue.setSnapshot("saved");
  queue.setEnabled(true);
  await tick();
  await tick();
  assert.equal(calls, 2);
  assert.equal(states.at(-1)?.phase, "error");
  assert.equal(states.at(-1)?.message, "Offline.");
});

test("permanent failures require an explicit retry and paused changes are not uploaded automatically", async (t) => {
  let calls = 0;
  const queue = createAutoSyncQueue(
    async () => {
      calls++;
      throw new SyncFailure("Reconnect Google.");
    },
    () => {},
    { debounceMs: 1, retryMs: 1 },
  );
  t.after(queue.dispose);
  queue.setSnapshot("saved");
  await tick();
  assert.equal(calls, 0);
  queue.retry();
  await tick();
  assert.equal(calls, 1);
  queue.setEnabled(true);
  await tick();
  assert.equal(calls, 2);
  queue.setEnabled(false);
  queue.setSnapshot("new edit");
  await tick();
  assert.equal(calls, 2);
});

test("disposing on account change aborts uploads and ignores a late response", async () => {
  let signal: AbortSignal | undefined;
  let resolve!: (value: { lastSyncedAt: string }) => void;
  const states: SyncProgress[] = [];
  const queue = createAutoSyncQueue(
    (_value, current) => {
      signal = current;
      return new Promise((done) => {
        resolve = done;
      });
    },
    (value) => states.push(value),
    { debounceMs: 1 },
  );
  queue.setSnapshot("account A");
  queue.setEnabled(true);
  await tick();
  queue.dispose();
  const count = states.length;
  assert.equal(signal?.aborted, true);
  resolve({ lastSyncedAt: "late" });
  await tick();
  queue.setSnapshot("account B");
  queue.retry();
  assert.equal(states.length, count);
});

test("a failed partial upload invalidates the old acknowledgement so reverting and manual repair send again", async (t) => {
  const calls: string[] = [];
  const queue = createAutoSyncQueue(
    async (snapshot) => {
      calls.push(snapshot);
      if (snapshot === "B")
        throw new SyncFailure("Drive update failed after the Sheet changed.");
      return { lastSyncedAt: "2026-10-08T10:00:00Z" };
    },
    () => {},
    { debounceMs: 1 },
  );
  t.after(queue.dispose);
  queue.setEnabled(true);
  queue.setSnapshot("A");
  await tick();
  queue.setSnapshot("B");
  await tick();
  queue.setSnapshot("A");
  await tick();
  assert.deepEqual(calls, ["A", "B", "A"]);
  queue.retry();
  await tick();
  assert.deepEqual(calls, ["A", "B", "A", "A"]);
});
