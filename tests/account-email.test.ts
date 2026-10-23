import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { User } from "@supabase/supabase-js";
import { changeAccountEmail } from "../src/lib/account-email";
import {
  workspaceKeys,
  readWorkspaceEntries,
  writeWorkspaceEntries,
} from "../src/lib/workspace-storage";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "original@example.com",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-10-23T00:00:00Z",
};
const redirect = "https://daylight.example";

test("changing an existing account email keeps its ID and saved workspace intact", async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const keys = workspaceKeys(user.id);
  const entries = {
    "2026-10-23": { studyMinutes: 60, logged: true, remark: "Keep my notes" },
  };
  writeWorkspaceEntries(storage, user.id, entries);
  storage.setItem(keys.goal, "900");
  storage.setItem(keys.focus, "saved timer");
  const before = [...data];
  const updated = { ...user, new_email: "new@example.com" };
  const calls: unknown[] = [];
  const result = await changeAccountEmail(
    {
      getUser: async () => ({ data: { user }, error: null }),
      updateUser: async (attributes, options) => {
        calls.push({ attributes, options });
        return { data: { user: updated }, error: null };
      },
    },
    user.id,
    " NEW@example.com ",
    redirect,
    () => true,
  );
  assert.deepEqual(calls, [
    {
      attributes: { email: "new@example.com" },
      options: { emailRedirectTo: redirect },
    },
  ]);
  assert.deepEqual(result, { email: "new@example.com", pending: true });
  assert.deepEqual(workspaceKeys(updated.id), keys);
  assert.deepEqual(readWorkspaceEntries(storage, updated.id), entries);
  assert.deepEqual([...data], before);
});

test("invalid or unchanged emails never request an account update", async () => {
  let updates = 0;
  const auth = {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async () => {
      updates++;
      return { data: { user }, error: null };
    },
  };
  for (const email of ["", "not-an-email", "a@b c.com", "ORIGINAL@example.com"])
    await assert.rejects(
      changeAccountEmail(auth, user.id, email, redirect, () => true),
      /Enter/,
    );
  assert.equal(updates, 0);
});

test("a changed account or closed form cannot submit an email update after verification", async () => {
  let updates = 0;
  const auth = {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async () => {
      updates++;
      return { data: { user }, error: null };
    },
  };
  await assert.rejects(
    changeAccountEmail(
      auth,
      "another-owner",
      "new@example.com",
      redirect,
      () => true,
    ),
    /account changed/,
  );
  await assert.rejects(
    changeAccountEmail(auth, user.id, "new@example.com", redirect, () => false),
    /account changed/,
  );
  assert.equal(updates, 0);
});

test("failed verification and rejected email updates do not report success", async () => {
  let updates = 0;
  const error = new Error("Email delivery unavailable");
  const auth = {
    getUser: async () => ({ data: { user }, error }),
    updateUser: async () => {
      updates++;
      return { data: { user: null }, error };
    },
  };
  await assert.rejects(
    changeAccountEmail(auth, user.id, "new@example.com", redirect, () => true),
    error,
  );
  assert.equal(updates, 0);
  await assert.rejects(
    changeAccountEmail(
      { ...auth, getUser: async () => ({ data: { user }, error: null }) },
      user.id,
      "new@example.com",
      redirect,
      () => true,
    ),
    error,
  );
});

test("a completed email change and an unexpected returned account are distinguished", async () => {
  const auth = {
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async () => ({
      data: { user: { ...user, email: "new@example.com" } },
      error: null,
    }),
  };
  assert.deepEqual(
    await changeAccountEmail(
      auth,
      user.id,
      "new@example.com",
      redirect,
      () => true,
    ),
    { email: "new@example.com", pending: false },
  );
  await assert.rejects(
    changeAccountEmail(
      {
        ...auth,
        updateUser: async () => ({
          data: { user: { ...user, id: "another-owner" } },
          error: null,
        }),
      },
      user.id,
      "new@example.com",
      redirect,
      () => true,
    ),
    /Could not verify/,
  );
});
