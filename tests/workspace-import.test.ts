import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  applyWorkspaceSpreadsheetImport,
  spreadsheetImportKey,
} from "../src/lib/workspace-import";
import {
  readWorkspaceEntries,
  workspaceKeys,
  writeWorkspaceEntries,
} from "../src/lib/workspace-storage";
import { decodeEntries, type Entries } from "../src/lib/activity";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const cloud: Entries = {
  "2026-10-07": {
    logged: true,
    holiday: false,
    studyMinutes: 120,
    remark: "",
    timeMode: "tasks",
    tasks: [
      {
        id: "xlsx:Activities:40",
        title: "Web pentesting class",
        notes: "Original date kept in notes",
        status: "completed",
        minutes: 120,
        fromTime: "09:30",
        toTime: "11:30",
      },
    ],
  },
};
function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  return { data, storage };
}

test("opening a workspace adds the account's spreadsheet tasks and preserves existing days and notes", () => {
  const { data, storage } = memoryStorage();
  const original: Entries = {
    "2026-10-07": {
      logged: true,
      studyMinutes: 240,
      remark: "My existing reflection",
      tasks: [
        {
          id: "local",
          title: "My task",
          status: "todo",
          notes: "Keep this",
          minutes: 30,
        },
      ],
    },
    "2026-10-12": { logged: false, studyMinutes: 0, remark: "Today" },
  };
  writeWorkspaceEntries(storage, alice, original);
  const merged = applyWorkspaceSpreadsheetImport(storage, alice, {
    user_id: alice,
    entries: cloud,
  });
  assert.equal(merged["2026-10-07"].tasks?.length, 2);
  assert.equal(merged["2026-10-07"].studyMinutes, 240);
  assert.equal(merged["2026-10-07"].remark, "My existing reflection");
  assert.deepEqual(merged["2026-10-12"], original["2026-10-12"]);
  assert.deepEqual(readWorkspaceEntries(storage, alice), merged);
  assert.deepEqual(
    decodeEntries(data.get(`${spreadsheetImportKey(alice)}:before`)!),
    original,
  );
  assert.equal(merged["2026-10-07"].tasks?.[1].fromTime, "09:30");
  assert.deepEqual(readWorkspaceEntries(storage, bob), {});
});

test("reopening does not duplicate activities or resurrect a deliberately deleted imported task", () => {
  const { storage } = memoryStorage();
  const first = applyWorkspaceSpreadsheetImport(storage, alice, {
    user_id: alice,
    entries: cloud,
  });
  assert.deepEqual(
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: cloud,
    }),
    first,
  );
  const edited: Entries = {
    "2026-10-07": {
      ...first["2026-10-07"],
      studyMinutes: 0,
      tasks: [],
      remark: "I deleted the imported task",
    },
  };
  writeWorkspaceEntries(storage, alice, edited);
  assert.deepEqual(
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: cloud,
    }),
    edited,
  );
});

test("existing spreadsheet task edits survive the first automatic load and later new rows are added", () => {
  const { storage } = memoryStorage();
  const edited: Entries = {
    "2026-10-07": {
      ...cloud["2026-10-07"],
      tasks: [
        {
          ...cloud["2026-10-07"].tasks![0],
          title: "My edited title",
          status: "on-hold",
        },
      ],
    },
  };
  writeWorkspaceEntries(storage, alice, edited);
  assert.deepEqual(
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: cloud,
    }),
    edited,
  );
  const extra: Entries = {
    ...cloud,
    "2026-10-08": {
      ...cloud["2026-10-07"],
      tasks: [{ ...cloud["2026-10-07"].tasks![0], id: "xlsx:Activities:42" }],
    },
  };
  const merged = applyWorkspaceSpreadsheetImport(storage, alice, {
    user_id: alice,
    entries: extra,
  });
  assert.equal(merged["2026-10-07"].tasks?.[0].title, "My edited title");
  assert.equal(merged["2026-10-08"].tasks?.length, 1);
});

test("the automatic import rejects foreign accounts, invalid data and corrupt local history without changing storage", () => {
  const { data, storage } = memoryStorage();
  writeWorkspaceEntries(storage, alice, cloud);
  const before = [...data];
  assert.throws(
    () =>
      applyWorkspaceSpreadsheetImport(storage, bob, {
        user_id: alice,
        entries: cloud,
      }),
    /different account/,
  );
  assert.throws(() =>
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: { broken: { tasks: [] } },
    }),
  );
  assert.deepEqual([...data], before);
  data.set(spreadsheetImportKey(alice), "invalid json");
  const corrupt = [...data];
  assert.throws(() =>
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: cloud,
    }),
  );
  assert.deepEqual([...data], corrupt);
});

test("ordinary cloud tasks are not imported or overwritten during the spreadsheet import", () => {
  const { data, storage } = memoryStorage();
  const ordinary: Entries = {
    "2026-10-07": {
      ...cloud["2026-10-07"],
      tasks: [{ ...cloud["2026-10-07"].tasks![0], id: "manual-task" }],
    },
  };
  assert.deepEqual(
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: ordinary,
    }),
    {},
  );
  assert.equal(data.size, 0);
});

test("a full day conflict fails atomically and corrupt saved activities are left intact", () => {
  const { data, storage } = memoryStorage();
  writeWorkspaceEntries(storage, alice, {
    "2026-10-07": {
      ...cloud["2026-10-07"],
      studyMinutes: 540,
      tasks: [
        { ...cloud["2026-10-07"].tasks![0], id: "full-day", minutes: 540 },
      ],
    },
  });
  const before = [...data];
  assert.throws(
    () =>
      applyWorkspaceSpreadsheetImport(storage, alice, {
        user_id: alice,
        entries: cloud,
      }),
  );
  assert.deepEqual([...data], before);
  data.set(workspaceKeys(alice).activity, "corrupt saved activities");
  const corrupt = [...data];
  assert.throws(() =>
    applyWorkspaceSpreadsheetImport(storage, alice, {
      user_id: alice,
      entries: cloud,
    }),
  );
  assert.deepEqual([...data], corrupt);
});
