import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  workspaceKeys,
  readWorkspaceEntries,
  writeWorkspaceEntries,
} from "../src/lib/workspace-storage";
import { STORAGE_KEY, encodeEntries, decodeEntries } from "../src/lib/activity";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
test("account workspaces separate activities, focus timers and goals, including legacy data", () => {
  const a = workspaceKeys(alice),
    b = workspaceKeys(bob);
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  store.set(
    STORAGE_KEY,
    encodeEntries({
      "2026-10-07": { studyMinutes: 0, logged: false, remark: "Legacy" },
    }),
  );
  writeWorkspaceEntries(storage, alice, {
    "2026-10-08": { studyMinutes: 60, logged: true, remark: "Alice" },
  });
  store.set(a.focus, JSON.stringify({ target: "Alice task", seconds: 120 }));
  store.set(a.goal, "300");
  assert.deepEqual(readWorkspaceEntries(storage, bob), {});
  assert.equal(store.get(b.focus), undefined);
  assert.equal(store.get(b.goal), undefined);
  writeWorkspaceEntries(storage, bob, {
    "2026-10-08": { studyMinutes: 120, logged: true, remark: "Bob" },
  });
  assert.equal(
    readWorkspaceEntries(storage, alice)["2026-10-08"].remark,
    "Alice",
  );
  assert.equal(readWorkspaceEntries(storage, bob)["2026-10-08"].remark, "Bob");
  assert.equal(
    decodeEntries(store.get(STORAGE_KEY)!)["2026-10-07"].remark,
    "Legacy",
  );
  assert.equal(
    new Set([...Object.values(a), ...Object.values(b), STORAGE_KEY]).size,
    7,
  );
});
test("workspace owners must be valid account IDs", () => {
  for (const invalid of [
    "",
    "anonymous",
    "../another-user",
    "daylight.activity.v1",
  ])
    assert.throws(() => workspaceKeys(invalid), /signed-in account/);
  assert.deepEqual(workspaceKeys(alice.toUpperCase()), workspaceKeys(alice));
});
