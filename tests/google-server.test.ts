import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entries } from "../src/lib/activity";
import { buildGoogleBackup } from "../src/lib/google-data";
import {
  GoogleSyncError,
  assertGoogleOrigin,
  createGoogleOAuth,
  googleConfig,
  googleErrorResponse,
  openGoogleSecret,
  parseSpreadsheetUrl,
  readGoogleBody,
  sealGoogleSecret,
  verifyGoogleOAuth,
  type GoogleConfig,
  type GoogleIdentity,
} from "../src/lib/google-server";
import {
  buildGoogleUpdateCells,
  googlePublicStatus,
  googleReconnectValues,
  exchangeGoogleCode,
  syncGoogleSnapshot,
  type GoogleConnection,
  type GoogleConnectionStore,
} from "../src/lib/google-server-sync";
import {
  googleCallbackGet,
  googleConnectPost,
  googleSyncPost,
} from "../src/lib/google-server-routes";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const key = Buffer.alloc(32, 42);
const config: GoogleConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  appUrl: "http://localhost:3000",
  redirectUri: "http://localhost:3000/api/google/callback",
  encryptionKey: key,
};
const identity: GoogleIdentity = {
  userId: alice,
  accessToken: "test-jwt",
  db: {} as SupabaseClient,
};
const entries: Entries = {
  "2026-10-08": {
    logged: true,
    holiday: false,
    studyMinutes: 60,
    remark: "=not a formula",
    tasks: [
      {
        id: "task-1",
        title: "Learn OAuth",
        status: "in-progress",
        notes: "A task",
        minutes: 60,
      },
    ],
  },
};

function newConnection(): GoogleConnection {
  return {
    user_id: alice,
    token_ciphertext: sealGoogleSecret(
      {
        accessToken: "google-access",
        refreshToken: "google-refresh",
        expiresAt: Date.now() + 3600_000,
        subject: "google-account-alice",
      },
      key,
      alice,
      "connection",
    ),
    spreadsheet_id: "spreadsheet_test123",
    managed_tabs: null,
    backup_file_id: null,
    auto_sync: true,
    last_synced_at: null,
    last_error: null,
    sync_lock: null,
    lock_expires_at: null,
    sync_revision: 0,
    snapshot_hash: null,
  };
}

class MemoryStore implements GoogleConnectionStore {
  row: GoogleConnection | null = newConnection();
  mutations: Partial<GoogleConnection>[] = [];
  async get() {
    return this.row;
  }
  async acquire() {
    if (!this.row || this.row.sync_lock)
      throw new GoogleSyncError("Another sync is running.", 409, "SYNC_BUSY");
    this.row = {
      ...this.row,
      sync_lock: "lease-1",
      lock_expires_at: new Date(Date.now() + 120_000).toISOString(),
    };
    return { row: this.row, lease: "lease-1" };
  }
  async save(lease: string, values: Partial<GoogleConnection>) {
    assert.equal(
      this.row?.sync_lock,
      lease,
      "Every database mutation must own the lease",
    );
    this.mutations.push(values);
    this.row = { ...this.row!, ...values };
    return this.row;
  }
  async release(lease: string) {
    if (this.row?.sync_lock === lease)
      this.row = { ...this.row, sync_lock: null, lock_expires_at: null };
  }
  async remove(lease: string) {
    assert.equal(this.row?.sync_lock, lease);
    this.row = null;
  }
  async insert(
    values: Pick<
      GoogleConnection,
      "user_id" | "token_ciphertext" | "spreadsheet_id"
    >,
  ) {
    this.row = { ...newConnection(), ...values };
  }
}

function googleFixture(store: MemoryStore, failFirstUpload = false) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const sheets = [
    {
      properties: {
        sheetId: 7,
        title: "Daylight Days",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
    },
  ];
  let backupCreated = false,
    shouldFailUpload = failFirstUpload,
    creates = 0;
  const respond = (value: unknown, status = 200) =>
    Response.json(value, { status });
  const fetcher = (async (input, init) => {
    const url = String(input),
      method = init?.method ?? "GET",
      body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body });
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer google-access",
    );
    if (url.startsWith("https://sheets.googleapis.com") && method === "GET")
      return respond({ sheets });
    if (url.endsWith(":batchUpdate")) {
      assert.ok(
        store.row?.managed_tabs,
        "Owned tab IDs must be saved before Google writes",
      );
      const data = JSON.parse(body!);
      for (const request of data.requests)
        if (request.addSheet) sheets.push(request.addSheet);
      return respond({});
    }
    if (url.includes("/generateIds?"))
      return respond({ ids: ["backup_file_test123"] });
    if (
      url.includes("/drive/v3/files/backup_file_test123?") &&
      method === "GET"
    ) {
      return backupCreated
        ? respond({
            id: "backup_file_test123",
            appProperties: { daylightOwner: alice },
          })
        : respond({}, 404);
    }
    if (url === "https://www.googleapis.com/drive/v3/files?fields=id") {
      assert.equal(
        store.row?.backup_file_id,
        "backup_file_test123",
        "The reserved file ID must be durable before create",
      );
      const metadata = JSON.parse(body!);
      assert.equal(metadata.id, "backup_file_test123");
      assert.equal(metadata.appProperties.daylightOwner, alice);
      backupCreated = true;
      creates++;
      return respond({ id: metadata.id });
    }
    if (
      url.startsWith("https://www.googleapis.com/upload/drive/v3/files/") &&
      method === "PATCH"
    ) {
      if (shouldFailUpload) {
        shouldFailUpload = false;
        return respond({}, 500);
      }
      assert.equal(JSON.parse(body!).version, 1);
      return respond({ id: "backup_file_test123" });
    }
    throw new Error(`Unexpected mocked Google request: ${method} ${url}`);
  }) as typeof fetch;
  return {
    fetcher,
    calls,
    sheets,
    creates: () => creates,
    failNextUpload: () => {
      shouldFailUpload = true;
    },
  };
}

test("Google secrets authenticate their account and purpose and reject tampering", () => {
  const sealed = sealGoogleSecret(
    { refreshToken: "private-token" },
    key,
    alice,
    "connection",
  );
  assert.ok(!sealed.includes("private-token"));
  assert.deepEqual(openGoogleSecret(sealed, key, alice, "connection"), {
    refreshToken: "private-token",
  });
  assert.throws(
    () => openGoogleSecret(sealed, key, bob, "connection"),
    /could not be verified/,
  );
  assert.throws(
    () => openGoogleSecret(sealed.replace(alice, bob), key, bob, "connection"),
    /could not be verified/,
  );
  assert.throws(
    () => openGoogleSecret(sealed, key, alice, "oauth"),
    /could not be verified/,
  );
  assert.throws(
    () => openGoogleSecret(sealed, Buffer.alloc(32, 43), alice, "connection"),
    /could not be verified/,
  );
  const pieces = sealed.split(".");
  const ciphertext = Buffer.from(pieces[4], "base64url");
  ciphertext[0] ^= 1;
  pieces[4] = ciphertext.toString("base64url");
  assert.throws(
    () => openGoogleSecret(pieces.join("."), key, alice, "connection"),
    /could not be verified/,
  );
});

test("OAuth uses PKCE, encrypted browser state and exact configured callback", () => {
  const now = 1000,
    oauth = createGoogleOAuth(
      config,
      alice,
      "supabase-jwt",
      "spreadsheet_test123",
      now,
    );
  const url = new URL(oauth.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid",
  );
  const state = verifyGoogleOAuth(
    oauth.cookie,
    url.searchParams.get("state"),
    config,
    now + 1,
  );
  assert.equal(state.userId, alice);
  assert.equal(state.accessToken, "supabase-jwt");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(state.verifier).digest("base64url"),
  );
  assert.ok(!oauth.cookie.includes("supabase-jwt"));
  assert.throws(
    () => verifyGoogleOAuth(oauth.cookie, "different-state", config, now + 1),
    /expired or did not match/,
  );
  assert.throws(
    () =>
      verifyGoogleOAuth(
        oauth.cookie,
        url.searchParams.get("state"),
        config,
        now + 480_000,
      ),
    /expired or did not match/,
  );
});

test("Spreadsheet URLs and configured origins reject lookalikes and insecure hosts", () => {
  assert.equal(
    parseSpreadsheetUrl(
      "https://docs.google.com/spreadsheets/d/abcdefghijk123/edit#gid=0",
    ),
    "abcdefghijk123",
  );
  for (const bad of [
    "https://docs.google.com.evil.example/spreadsheets/d/abcdefghijk123/edit",
    "http://docs.google.com/spreadsheets/d/abcdefghijk123/edit",
    "https://user@docs.google.com/spreadsheets/d/abcdefghijk123/edit",
    "https://docs.google.com:444/spreadsheets/d/abcdefghijk123/edit",
    "https://docs.google.com/document/d/abcdefghijk123/edit",
  ])
    assert.throws(() => parseSpreadsheetUrl(bad));
  const env = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_TOKEN_ENCRYPTION_KEY: key.toString("base64"),
    APP_URL: config.appUrl,
  };
  assert.equal(googleConfig(env).redirectUri, config.redirectUri);
  assert.throws(
    () => googleConfig({ ...env, APP_URL: "http://external.example" }),
    /HTTPS origin/,
  );
  assert.throws(
    () => googleConfig({ ...env, APP_URL: "https://example.com/?next=evil" }),
    /HTTPS origin/,
  );
  assert.throws(
    () => googleConfig({ ...env, GOOGLE_TOKEN_ENCRYPTION_KEY: "invalid" }),
    /32-byte/,
  );
  assert.throws(() => googleConfig({}), /server configuration/);
});

test("Mutations require same-origin JSON and cap the actual streamed body", async () => {
  const req = (origin: string) =>
    new Request(`${config.appUrl}/api/google/sync`, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: "{}",
    });
  assert.doesNotThrow(() =>
    assertGoogleOrigin(req(config.appUrl), config.appUrl),
  );
  assert.throws(
    () => assertGoogleOrigin(req("https://evil.example"), config.appUrl),
    /must come from this app/,
  );
  assert.throws(() =>
    assertGoogleOrigin(
      new Request(`${config.appUrl}/api/google/sync`, {
        method: "POST",
        headers: { origin: config.appUrl, "sec-fetch-site": "cross-site" },
      }),
      config.appUrl,
    ),
  );
  assert.deepEqual(await readGoogleBody(req(config.appUrl)), {});
  await assert.rejects(
    readGoogleBody(
      new Request(config.appUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(100) }),
      }),
      20,
    ),
    (error) => error instanceof GoogleSyncError && error.status === 413,
  );
  await assert.rejects(
    readGoogleBody(
      new Request(config.appUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    ),
    (error) => error instanceof GoogleSyncError && error.status === 415,
  );
});

test("Full sync preserves existing tabs, sends literal cells and acknowledges both targets", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store);
  const result = await syncGoogleSnapshot(
    config,
    identity,
    entries,
    0,
    store,
    google.fetcher,
  );
  assert.equal(result.revision, 1);
  assert.equal(
    result.snapshotHash,
    createHash("sha256").update(buildGoogleBackup(entries)).digest("hex"),
  );
  assert.ok(result.lastSyncedAt);
  assert.equal(store.row?.sync_lock, null);
  assert.notEqual(store.row?.managed_tabs?.days.id, 7);
  assert.notEqual(store.row?.managed_tabs?.days.title, "Daylight Days");
  const batch = JSON.parse(
    google.calls.find((call) => call.url.endsWith(":batchUpdate"))!.body!,
  );
  const cellRequests = batch.requests.filter(
    (request: { updateCells?: unknown }) => request.updateCells,
  );
  assert.equal(cellRequests.length, 2);
  assert.ok(
    cellRequests.every(
      (request: { updateCells: { range: { sheetId: number } } }) =>
        request.updateCells.range.sheetId !== 7,
    ),
  );
  assert.deepEqual(cellRequests[0].updateCells.rows[1].values[5], {
    userEnteredValue: { stringValue: "=not a formula" },
  });
  assert.ok(!google.calls.some((call) => call.body?.includes("formulaValue")));
  assert.equal(google.creates(), 1);
  const finalMutation = store.mutations[store.mutations.length - 1];
  assert.equal(finalMutation.sync_revision, 1);
  assert.ok(finalMutation.last_synced_at);
  const write = buildGoogleUpdateCells({ id: 123, title: "Managed" }, [
    ["=literal", 2, true],
  ]);
  assert.deepEqual(write.updateCells.range, { sheetId: 123 });
  assert.equal(write.updateCells.fields, "userEnteredValue");
});

test("Partial Drive failure keeps sync pending and retry reuses reserved tabs and backup ID", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store, true);
  await assert.rejects(
    syncGoogleSnapshot(config, identity, entries, 0, store, google.fetcher),
  );
  const reservedTabs = structuredClone(store.row?.managed_tabs);
  assert.equal(store.row?.backup_file_id, "backup_file_test123");
  assert.equal(store.row?.last_synced_at, null);
  assert.equal(store.row?.snapshot_hash, null);
  assert.equal(store.row?.sync_revision, 0);
  assert.ok(store.row?.last_error);
  assert.equal(store.row?.sync_lock, null);
  const result = await syncGoogleSnapshot(
    config,
    identity,
    entries,
    0,
    store,
    google.fetcher,
  );
  assert.equal(result.revision, 1);
  assert.deepEqual(store.row?.managed_tabs, reservedTabs);
  assert.equal(google.creates(), 1);
  assert.equal(
    google.calls.filter((call) => call.url.includes("/generateIds?")).length,
    1,
  );
  assert.equal(store.row?.last_error, null);
});

test("A stale device cannot overwrite newer Google data; acknowledged identical retries repair safely", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store);
  await syncGoogleSnapshot(config, identity, entries, 0, store, google.fetcher);
  const firstCalls = google.calls.length;
  const idempotent = await syncGoogleSnapshot(
    config,
    identity,
    entries,
    0,
    store,
    google.fetcher,
  );
  assert.equal(idempotent.revision, 2);
  assert.ok(google.calls.length > firstCalls);
  const repairedCalls = google.calls.length;
  const different = structuredClone(entries);
  different["2026-10-08"].remark = "Edited on an old device";
  await assert.rejects(
    syncGoogleSnapshot(config, identity, different, 0, store, google.fetcher),
    (error) =>
      error instanceof GoogleSyncError && error.code === "SYNC_CONFLICT",
  );
  assert.equal(store.row?.sync_revision, 2);
  assert.equal(google.calls.length, repairedCalls);
  assert.equal(store.row?.sync_lock, null);
});

test("Reverting after a partial write repairs both targets, and unchanged resync restores removed tabs", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store);
  await syncGoogleSnapshot(config, identity, entries, 0, store, google.fetcher);
  const originalTabs = structuredClone(store.row!.managed_tabs!);
  const changed = structuredClone(entries);
  changed["2026-10-08"].remark = "Snapshot B";
  google.failNextUpload();
  await assert.rejects(
    syncGoogleSnapshot(config, identity, changed, 1, store, google.fetcher),
  );
  assert.equal(
    store.row?.snapshot_hash,
    null,
    "A previous acknowledged hash cannot claim a partially modified sheet is healthy",
  );
  assert.equal(store.row?.sync_revision, 1);
  const lastBatch = () =>
    JSON.parse(
      google.calls.filter((call) => call.url.endsWith(":batchUpdate")).at(-1)!
        .body!,
    );
  const dailyRemark = () =>
    lastBatch().requests.find(
      (request: { updateCells?: { range: { sheetId: number } } }) =>
        request.updateCells?.range.sheetId === originalTabs.days.id,
    ).updateCells.rows[1].values[5].userEnteredValue.stringValue;
  assert.equal(dailyRemark(), "Snapshot B");
  const repaired = await syncGoogleSnapshot(
    config,
    identity,
    entries,
    1,
    store,
    google.fetcher,
  );
  assert.equal(repaired.revision, 2);
  assert.equal(dailyRemark(), "=not a formula");
  assert.equal(
    google.calls.filter((call) => call.method === "PATCH").at(-1)!.body,
    buildGoogleBackup(entries),
  );
  google.sheets.splice(
    google.sheets.findIndex(
      (sheet) => sheet.properties.sheetId === originalTabs.days.id,
    ),
    1,
  );
  const restored = await syncGoogleSnapshot(
    config,
    identity,
    entries,
    2,
    store,
    google.fetcher,
  );
  assert.equal(restored.revision, 3);
  assert.ok(
    lastBatch().requests.some(
      (request: { addSheet?: { properties: { sheetId: number } } }) =>
        request.addSheet?.properties.sheetId === originalTabs.days.id,
    ),
  );
  assert.ok(
    google.sheets.some(
      (sheet) => sheet.properties.sheetId === originalTabs.days.id,
    ),
  );
  assert.equal(google.creates(), 1);
});

test("Expired Google tokens refresh under the lease while preserving an omitted refresh token", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store);
  store.row!.token_ciphertext = sealGoogleSecret(
    {
      accessToken: "old-access",
      refreshToken: "keep-refresh",
      expiresAt: 1,
      subject: "google-account-alice",
    },
    key,
    alice,
    "connection",
  );
  let refreshRequests = 0;
  const fetcher = (async (input, init) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      refreshRequests++;
      assert.equal(store.row!.sync_lock, "lease-1");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("refresh_token"), "keep-refresh");
      return Response.json({ access_token: "google-access", expires_in: 3600 });
    }
    return google.fetcher(input, init);
  }) as typeof fetch;
  await syncGoogleSnapshot(config, identity, entries, 0, store, fetcher);
  assert.equal(refreshRequests, 1);
  const tokens = openGoogleSecret<{
    refreshToken: string;
    accessToken: string;
  }>(store.row!.token_ciphertext, key, alice, "connection");
  assert.equal(tokens.refreshToken, "keep-refresh");
  assert.equal(tokens.accessToken, "google-access");
});

test("Permanent Google permissions errors stay actionable and never claim sync completion", async () => {
  const store = new MemoryStore();
  const fetcher = (async () =>
    Response.json(
      { error: "upstream details should stay private" },
      { status: 403 },
    )) as typeof fetch;
  await assert.rejects(
    syncGoogleSnapshot(config, identity, entries, 0, store, fetcher),
    (error) => error instanceof GoogleSyncError && error.status === 403,
  );
  assert.equal(store.row!.sync_revision, 0);
  assert.equal(store.row!.last_synced_at, null);
  assert.match(store.row!.last_error!, /Google denied access/);
  assert.ok(!store.row!.last_error!.includes("upstream"));
  assert.equal(store.row!.sync_lock, null);
});

test("Busy leases and foreign-account connections never write to Google", async () => {
  const store = new MemoryStore(),
    google = googleFixture(store);
  store.row!.sync_lock = "another-lease";
  await assert.rejects(
    syncGoogleSnapshot(config, identity, entries, 0, store, google.fetcher),
    (error) => error instanceof GoogleSyncError && error.code === "SYNC_BUSY",
  );
  assert.equal(google.calls.length, 0);
  store.row!.sync_lock = null;
  store.row!.user_id = bob;
  await assert.rejects(
    syncGoogleSnapshot(config, identity, entries, 0, store, google.fetcher),
    (error) => error instanceof GoogleSyncError && error.status === 403,
  );
  assert.equal(google.calls.length, 0);
});

test("Status and error responses expose no token ciphertext or upstream secrets", async () => {
  const row = newConnection(),
    status = googlePublicStatus(row);
  assert.equal(status.connected, true);
  assert.ok(!JSON.stringify(status).includes("ciphertext"));
  assert.ok(!JSON.stringify(status).includes("google-access"));
  const response = googleErrorResponse(new Error("client_secret=private"));
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private"));
  const conflict = googleErrorResponse(
    new GoogleSyncError("Review first", 409, "SYNC_CONFLICT"),
  );
  assert.equal((await conflict.json()).code, "SYNC_CONFLICT");
});

test("Unconfigured routes and invalid callbacks fail safely and always clear OAuth state", async () => {
  const names = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
    "APP_URL",
  ] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    names.forEach((name) => delete process.env[name]);
    const response = await googleConnectPost(
      new Request(`${config.appUrl}/api/google/connect`, {
        method: "POST",
        headers: { origin: config.appUrl, "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /server configuration/);
    process.env.GOOGLE_CLIENT_ID = config.clientId;
    process.env.GOOGLE_CLIENT_SECRET = config.clientSecret;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = key.toString("base64");
    process.env.APP_URL = config.appUrl;
    const crossOrigin = await googleSyncPost(
      new Request(`${config.appUrl}/api/google/sync`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(crossOrigin.status, 403);
    const unauthorized = await googleSyncPost(
      new Request(`${config.appUrl}/api/google/sync`, {
        method: "POST",
        headers: { origin: config.appUrl, "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(unauthorized.status, 401);
    const callback = await googleCallbackGet(
      new Request(
        `${config.appUrl}/api/google/callback?code=private-code&state=invalid`,
      ),
    );
    assert.equal(callback.status, 303);
    assert.equal(
      callback.headers.get("location"),
      `${config.appUrl}/?google_sync=error`,
    );
    assert.match(
      callback.headers.get("set-cookie")!,
      /HttpOnly; SameSite=Lax; Path=\/api\/google\/callback; Max-Age=0/,
    );
    assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
    assert.ok(!callback.headers.get("location")!.includes("private-code"));
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});

test("reconnecting another Google account resets only that user's targets and keeps old files intact", () => {
  const row = {
    ...newConnection(),
    backup_file_id: "old_backup_file123",
    snapshot_hash: "a".repeat(64),
    sync_revision: 4,
  };
  const tokens = {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresAt: Date.now() + 3600000,
    subject: "google-account-alice",
  };
  const same = googleReconnectValues(
    config,
    alice,
    row,
    tokens,
    row.spreadsheet_id,
  );
  assert.equal(same.backup_file_id, undefined);
  const changed = googleReconnectValues(
    config,
    alice,
    row,
    { ...tokens, subject: "another-google-account" },
    row.spreadsheet_id,
  );
  assert.equal(changed.backup_file_id, null);
  assert.equal(changed.managed_tabs, null);
  assert.equal(changed.snapshot_hash, null);
  assert.equal(changed.sync_revision, undefined);
  assert.equal(row.backup_file_id, "old_backup_file123");
  assert.throws(
    () => googleReconnectValues(config, bob, row, tokens, row.spreadsheet_id),
    /another workspace/,
  );
});

test("OAuth verifies Google subject before saving authorization and requires both file permissions", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    calls.push(String(input));
    return Response.json(
      String(input).includes("/userinfo")
        ? { sub: "verified-google-user" }
        : {
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
            scope:
              "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid",
          },
    );
  };
  const tokens = await exchangeGoogleCode(config, "code", "verifier", fetcher);
  assert.equal(tokens.subject, "verified-google-user");
  assert.equal(calls[1], "https://openidconnect.googleapis.com/v1/userinfo");
  const denied: typeof fetch = async () =>
    Response.json({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      scope: "openid",
    });
  await assert.rejects(
    exchangeGoogleCode(config, "code", "verifier", denied),
    /Allow both/,
  );
});

test("an uncertain Google write keeps its recovery lease and never acknowledges completion", async () => {
  const store = new MemoryStore();
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith(":batchUpdate"))
      throw new Error("Connection lost after write acceptance");
    return Response.json({ sheets: [] });
  };
  await assert.rejects(
    syncGoogleSnapshot(config, identity, entries, 0, store, fetcher),
    /wait two minutes/,
  );
  assert.equal(store.row?.sync_lock, "lease-1");
  assert.equal(store.row?.snapshot_hash, null);
  assert.equal(store.row?.sync_revision, 0);
  assert.equal(store.row?.last_synced_at, null);
  await assert.rejects(store.acquire(), /Another sync/);
});
