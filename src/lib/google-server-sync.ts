import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Entries } from "./activity";
import { buildGoogleBackup, buildGoogleTables } from "./google-data";
import {
  GOOGLE_TABLE,
  GOOGLE_SCOPES,
  GoogleSyncError,
  openGoogleSecret,
  sealGoogleSecret,
  type GoogleConfig,
  type GoogleIdentity,
} from "./google-server";

export type ManagedTab = { id: number; title: string };
export type ManagedTabs = { days: ManagedTab; tasks: ManagedTab };
export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  subject: string;
};
export type GoogleConnection = {
  user_id: string;
  token_ciphertext: string;
  spreadsheet_id: string;
  managed_tabs: ManagedTabs | null;
  backup_file_id: string | null;
  auto_sync: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  sync_lock: string | null;
  lock_expires_at: string | null;
  sync_revision: number;
  snapshot_hash: string | null;
};

export function googleReconnectValues(
  config: GoogleConfig,
  userId: string,
  row: GoogleConnection,
  tokens: GoogleTokens,
  spreadsheetId: string,
): Partial<GoogleConnection> {
  if (row.user_id !== userId)
    throw new GoogleSyncError(
      "This Google connection belongs to another workspace.",
      403,
    );
  let oldSubject: string | undefined;
  try {
    oldSubject = openGoogleSecret<GoogleTokens>(
      row.token_ciphertext,
      config.encryptionKey,
      userId,
      "connection",
    ).subject;
  } catch {
    /* A reconnect can replace credentials after key rotation. */
  }
  const changedGoogleAccount = oldSubject !== tokens.subject;
  const changedTarget = row.spreadsheet_id !== spreadsheetId;
  return {
    token_ciphertext: sealGoogleSecret(
      tokens,
      config.encryptionKey,
      userId,
      "connection",
    ),
    spreadsheet_id: spreadsheetId,
    auto_sync: true,
    last_error: null,
    ...(changedTarget || changedGoogleAccount
      ? {
          managed_tabs: null,
          last_synced_at: null,
          snapshot_hash: null,
          ...(changedGoogleAccount ? { backup_file_id: null } : {}),
        }
      : {}),
  };
}

export interface GoogleConnectionStore {
  get(): Promise<GoogleConnection | null>;
  acquire(): Promise<{ row: GoogleConnection; lease: string }>;
  save(
    lease: string,
    values: Partial<GoogleConnection>,
  ): Promise<GoogleConnection>;
  release(lease: string): Promise<void>;
  remove(lease: string): Promise<void>;
  insert(
    values: Pick<
      GoogleConnection,
      "user_id" | "token_ciphertext" | "spreadsheet_id"
    >,
  ): Promise<void>;
}

function databaseError(error: { code?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205")
    throw new GoogleSyncError(
      "Google sync storage needs setup. Ask the app owner to install the Google sync schema.",
      503,
    );
  if (error?.code === "23505")
    throw new GoogleSyncError(
      "Another Google connection was just saved. Refresh and try again.",
      409,
    );
  throw new GoogleSyncError(
    "Google sync storage is unavailable. Your local data is safe; try again.",
    503,
  );
}

export function googleConnectionStore(
  identity: GoogleIdentity,
): GoogleConnectionStore {
  const table = () => identity.db.from(GOOGLE_TABLE);
  return {
    async get() {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", identity.userId)
        .maybeSingle();
      if (error) databaseError(error);
      return data as GoogleConnection | null;
    },
    async acquire() {
      const lease = randomUUID(),
        now = new Date().toISOString();
      const { data, error } = await table()
        .update({
          sync_lock: lease,
          lock_expires_at: new Date(Date.now() + 120_000).toISOString(),
        })
        .eq("user_id", identity.userId)
        .or(`sync_lock.is.null,lock_expires_at.lt.${now}`)
        .select("*")
        .maybeSingle();
      if (error) databaseError(error);
      if (!data) {
        const existing = await this.get();
        if (!existing)
          throw new GoogleSyncError(
            "Connect Google before syncing your workspace.",
            400,
          );
        throw new GoogleSyncError(
          "Another Google sync is running. Try again shortly.",
          409,
          "SYNC_BUSY",
        );
      }
      return { row: data as GoogleConnection, lease };
    },
    async save(lease, values) {
      const { data, error } = await table()
        .update({
          ...values,
          lock_expires_at: new Date(Date.now() + 120_000).toISOString(),
        })
        .eq("user_id", identity.userId)
        .eq("sync_lock", lease)
        .gt("lock_expires_at", new Date().toISOString())
        .select("*")
        .maybeSingle();
      if (error) databaseError(error);
      if (!data)
        throw new GoogleSyncError(
          "The Google sync connection changed. Refresh and try again.",
          409,
        );
      return data as GoogleConnection;
    },
    async release(lease) {
      const { error } = await table()
        .update({ sync_lock: null, lock_expires_at: null })
        .eq("user_id", identity.userId)
        .eq("sync_lock", lease);
      if (error) databaseError(error);
    },
    async remove(lease) {
      const { data, error } = await table()
        .delete()
        .eq("user_id", identity.userId)
        .eq("sync_lock", lease)
        .gt("lock_expires_at", new Date().toISOString())
        .select("user_id")
        .maybeSingle();
      if (error) databaseError(error);
      if (!data)
        throw new GoogleSyncError(
          "The Google sync connection changed. Refresh and try again.",
          409,
        );
    },
    async insert(values) {
      const { error } = await table().insert(values);
      if (error) databaseError(error);
    },
  };
}

export function googlePublicStatus(row: GoogleConnection | null) {
  return {
    configured: true,
    connected: !!row,
    autoSync: row?.auto_sync ?? false,
    spreadsheetUrl: row
      ? `https://docs.google.com/spreadsheets/d/${row.spreadsheet_id}/edit`
      : null,
    backupUrl: row?.backup_file_id
      ? `https://drive.google.com/file/d/${row.backup_file_id}/view`
      : null,
    lastSyncedAt: row?.last_synced_at ?? null,
    revision: row?.sync_revision ?? 0,
    snapshotHash: row?.snapshot_hash ?? null,
    ...(row?.last_error ? { error: row.last_error } : {}),
  };
}

class GoogleApiError extends GoogleSyncError {
  constructor(public upstreamStatus: number) {
    super(
      upstreamStatus === 401
        ? "Google authorization expired. Connect Google again."
        : upstreamStatus === 403
          ? "Google denied access. Check that Sheets and Drive APIs are enabled and that your Google account can edit the spreadsheet."
          : upstreamStatus === 404
            ? "The Google spreadsheet or backup is missing. Restore it in Google or connect another spreadsheet."
            : upstreamStatus === 429
              ? "Google is temporarily limiting updates. Your changes remain on this device and will retry."
              : "Google could not accept this update. Your local data is safe; try again.",
      [401, 403, 404, 429].includes(upstreamStatus) ? upstreamStatus : 502,
    );
  }
}

export async function googleJson<T>(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleSyncError(
      "Google did not respond in time. Your local data is safe; try again.",
      504,
    );
  }
  if (!response.ok) throw new GoogleApiError(response.status);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new GoogleSyncError(
      "Google returned an invalid response. Please try again.",
      502,
    );
  }
}

export async function exchangeGoogleCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleTokens> {
  const data = await googleJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
    },
    fetcher,
  );
  if (
    !data.access_token ||
    !data.refresh_token ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in! <= 0
  )
    throw new GoogleSyncError(
      "Google did not grant offline access. Connect again and allow Sheets and Drive access.",
      400,
    );
  if (
    data.scope &&
    !GOOGLE_SCOPES.every((scope) => data.scope!.split(" ").includes(scope))
  )
    throw new GoogleSyncError(
      "Allow both spreadsheet updates and Drive backups to connect Google.",
      400,
    );
  const userInfo = await googleJson<{ sub?: string }>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${data.access_token}` },
    },
    fetcher,
  );
  if (
    typeof userInfo.sub !== "string" ||
    !userInfo.sub ||
    userInfo.sub.length > 255
  )
    throw new GoogleSyncError(
      "Google account identity could not be verified. Connect Google again.",
      401,
    );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in! * 1000,
    subject: userInfo.sub,
  };
}

async function currentGoogleToken(
  config: GoogleConfig,
  row: GoogleConnection,
  store: GoogleConnectionStore,
  lease: string,
  fetcher: typeof fetch,
) {
  const tokens = openGoogleSecret<GoogleTokens>(
    row.token_ciphertext,
    config.encryptionKey,
    row.user_id,
    "connection",
  );
  if (
    typeof tokens.accessToken !== "string" ||
    !tokens.accessToken ||
    typeof tokens.refreshToken !== "string" ||
    !tokens.refreshToken ||
    !Number.isFinite(tokens.expiresAt) ||
    typeof tokens.subject !== "string" ||
    !tokens.subject ||
    tokens.subject.length > 255
  )
    throw new GoogleSyncError(
      "Google authorization is invalid. Connect Google again.",
      401,
    );
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  let fresh: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  try {
    fresh = await googleJson(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: "refresh_token",
        }),
      },
      fetcher,
    );
  } catch (error) {
    if (
      error instanceof GoogleApiError &&
      [400, 401].includes(error.upstreamStatus)
    )
      throw new GoogleSyncError(
        "Google access was revoked or expired. Connect Google again.",
        401,
      );
    throw error;
  }
  if (
    !fresh.access_token ||
    !Number.isFinite(fresh.expires_in) ||
    fresh.expires_in! <= 0
  )
    throw new GoogleSyncError(
      "Google authorization could not refresh. Connect Google again.",
      401,
    );
  await store.save(lease, {
    token_ciphertext: sealGoogleSecret(
      {
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token ?? tokens.refreshToken,
        expiresAt: Date.now() + fresh.expires_in! * 1000,
        subject: tokens.subject,
      },
      config.encryptionKey,
      row.user_id,
      "connection",
    ),
  });
  return fresh.access_token;
}

type GoogleSheet = {
  properties: {
    sheetId: number;
    title: string;
    gridProperties?: { rowCount?: number; columnCount?: number };
  };
};
type Cell = string | number | boolean | null;

export function buildGoogleUpdateCells(tab: ManagedTab, values: Cell[][]) {
  return {
    updateCells: {
      // A whole-sheet range clears old values when this snapshot has fewer rows.
      range: { sheetId: tab.id },
      fields: "userEnteredValue",
      rows: values.map((row) => ({
        values: row.map((value) => ({
          ...(value === null
            ? {}
            : {
                userEnteredValue:
                  typeof value === "number"
                    ? { numberValue: value }
                    : typeof value === "boolean"
                      ? { boolValue: value }
                      : { stringValue: value },
              }),
        })),
      })),
    },
  };
}

function selectManagedTabs(sheets: GoogleSheet[]): ManagedTabs {
  const ids = new Set(sheets.map((sheet) => sheet.properties.sheetId));
  const titles = new Set(
    sheets.map((sheet) => sheet.properties.title.toLowerCase()),
  );
  const select = (base: string): ManagedTab => {
    let id: number;
    do {
      id = randomBytes(4).readUInt32BE() & 0x7fffffff;
    } while (ids.has(id));
    ids.add(id);
    let title = base;
    while (titles.has(title.toLowerCase()))
      title = `${base} (${randomBytes(3).toString("hex")})`;
    titles.add(title.toLowerCase());
    return { id, title };
  };
  return { days: select("Daylight Days"), tasks: select("Daylight Tasks") };
}

function validManagedTabs(value: ManagedTabs): boolean {
  return (
    !!value?.days &&
    !!value?.tasks &&
    value.days.id !== value.tasks.id &&
    [value.days, value.tasks].every(
      (tab) =>
        Number.isInteger(tab.id) &&
        tab.id >= 0 &&
        tab.id <= 0x7fffffff &&
        typeof tab.title === "string" &&
        tab.title.length > 0 &&
        tab.title.length <= 100,
    )
  );
}

export async function syncGoogleSnapshot(
  config: GoogleConfig,
  identity: GoogleIdentity,
  entries: Entries,
  expectedRevision: number,
  store: GoogleConnectionStore = googleConnectionStore(identity),
  fetcher: typeof fetch = fetch,
) {
  const { row: initial, lease } = await store.acquire();
  let row = initial;
  let externalWriteStarted = false,
    keepRecoveryLease = false;
  try {
    if (row.user_id !== identity.userId)
      throw new GoogleSyncError(
        "This Google connection belongs to another workspace.",
        403,
      );
    const backupContent = buildGoogleBackup(entries);
    const snapshotHash = createHash("sha256")
      .update(backupContent)
      .digest("hex");
    // A matching acknowledged snapshot may repair a lost response, removed tab
    // or edited backup even if the caller missed its revision acknowledgement.
    if (
      expectedRevision !== row.sync_revision &&
      row.snapshot_hash !== snapshotHash
    )
      throw new GoogleSyncError(
        "Google has a newer copy from another device. Review the spreadsheet before replacing it with this device's entries.",
        409,
        "SYNC_CONFLICT",
      );
    const tables = buildGoogleTables(entries);
    if (Math.max(tables.days.length, tables.tasks.length) > 100_000)
      throw new GoogleSyncError(
        "This backup exceeds 100,000 spreadsheet rows. Export it locally or use a smaller workspace.",
        413,
      );
    const token = await currentGoogleToken(config, row, store, lease, fetcher);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(row.spreadsheet_id)}`;
    const spreadsheet = await googleJson<{ sheets?: GoogleSheet[] }>(
      `${sheetUrl}?fields=sheets.properties`,
      { headers },
      fetcher,
    );
    const sheets = spreadsheet.sheets ?? [];
    if (!Array.isArray(sheets))
      throw new GoogleSyncError(
        "Google returned invalid spreadsheet details.",
        502,
      );
    if (!row.managed_tabs)
      row = await store.save(lease, {
        managed_tabs: selectManagedTabs(sheets),
      });
    if (!validManagedTabs(row.managed_tabs!))
      throw new GoogleSyncError(
        "The spreadsheet connection is invalid. Connect Google again.",
        400,
      );
    const tabs = row.managed_tabs!;
    const requests: unknown[] = [];
    for (const [tab, values] of [
      [tabs.days, tables.days],
      [tabs.tasks, tables.tasks],
    ] as [ManagedTab, Cell[][]][]) {
      const existing = sheets.find(
        (sheet) => sheet.properties.sheetId === tab.id,
      );
      const rowCount = Math.max(100, values.length),
        columnCount = values.reduce(
          (max, value) => Math.max(max, value.length),
          1,
        );
      if (!existing) {
        if (
          sheets.some(
            (sheet) =>
              sheet.properties.title.toLowerCase() === tab.title.toLowerCase(),
          )
        )
          throw new GoogleSyncError(
            "A spreadsheet tab conflicts with Daylight's reserved tab. Rename that tab and retry, or reconnect.",
            409,
          );
        requests.push({
          addSheet: {
            properties: {
              sheetId: tab.id,
              title: tab.title,
              gridProperties: { rowCount, columnCount, frozenRowCount: 1 },
            },
          },
        });
      } else if (
        (existing.properties.gridProperties?.rowCount ?? 0) < rowCount ||
        (existing.properties.gridProperties?.columnCount ?? 0) < columnCount
      ) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: tab.id,
              gridProperties: {
                rowCount: Math.max(
                  rowCount,
                  existing.properties.gridProperties?.rowCount ?? 0,
                ),
                columnCount: Math.max(
                  columnCount,
                  existing.properties.gridProperties?.columnCount ?? 0,
                ),
              },
            },
            fields: "gridProperties.rowCount,gridProperties.columnCount",
          },
        });
      }
      requests.push(buildGoogleUpdateCells(tab, values));
      requests.push({
        repeatCell: {
          range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.88, green: 0.86, blue: 1 },
            },
          },
          fields: "userEnteredFormat",
        },
      });
    }
    // Renew and verify ownership immediately before every external write.
    // A failed second write must not leave the previous snapshot marked healthy.
    // Keep the old revision until BOTH targets acknowledge this new snapshot.
    row = await store.save(lease, { snapshot_hash: null });
    externalWriteStarted = true;
    await googleJson(
      `${sheetUrl}:batchUpdate`,
      { method: "POST", headers, body: JSON.stringify({ requests }) },
      fetcher,
    );
    if (!row.backup_file_id) {
      const generated = await googleJson<{ ids?: string[] }>(
        "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files",
        { headers },
        fetcher,
      );
      if (
        !generated.ids?.[0] ||
        !/^[a-zA-Z0-9_-]{10,200}$/.test(generated.ids[0])
      )
        throw new GoogleSyncError(
          "Google could not reserve a backup file.",
          502,
        );
      // A pre-generated ID makes an uncertain create response safe to retry.
      row = await store.save(lease, { backup_file_id: generated.ids[0] });
    }
    const fileId = row.backup_file_id!;
    const fileUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    let backup: {
      id?: string;
      trashed?: boolean;
      appProperties?: Record<string, string>;
    } | null = null;
    try {
      backup = await googleJson(
        `${fileUrl}?fields=id,trashed,appProperties`,
        { headers },
        fetcher,
      );
    } catch (error) {
      if (!(error instanceof GoogleApiError && error.upstreamStatus === 404))
        throw error;
    }
    if (backup?.trashed)
      throw new GoogleSyncError(
        "The Daylight backup is in Google Drive's trash. Restore it and retry.",
        400,
      );
    if (
      backup &&
      (backup.id !== fileId ||
        backup.appProperties?.daylightOwner !== identity.userId)
    )
      throw new GoogleSyncError(
        "The backup file does not belong to this Daylight connection. Connect Google again.",
        403,
      );
    if (!backup) {
      await store.save(lease, {});
      try {
        await googleJson(
          "https://www.googleapis.com/drive/v3/files?fields=id",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              id: fileId,
              name: "Daylight backup.json",
              mimeType: "application/json",
              appProperties: { daylightOwner: identity.userId },
            }),
          },
          fetcher,
        );
      } catch (error) {
        if (!(error instanceof GoogleApiError && error.upstreamStatus === 409))
          throw error;
        const existing = await googleJson<{
          id?: string;
          appProperties?: Record<string, string>;
        }>(`${fileUrl}?fields=id,appProperties`, { headers }, fetcher);
        if (
          existing.id !== fileId ||
          existing.appProperties?.daylightOwner !== identity.userId
        )
          throw new GoogleSyncError(
            "The backup file could not be verified. Connect Google again.",
            403,
          );
      }
    }
    await store.save(lease, {});
    await googleJson(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
      { method: "PATCH", headers, body: backupContent },
      fetcher,
    );
    row = await store.save(lease, {
      last_synced_at: new Date().toISOString(),
      last_error: null,
      sync_revision: row.sync_revision + 1,
      snapshot_hash: snapshotHash,
    });
    const status = googlePublicStatus(row);
    return {
      lastSyncedAt: status.lastSyncedAt,
      revision: status.revision,
      snapshotHash: status.snapshotHash,
      spreadsheetUrl: status.spreadsheetUrl,
      backupUrl: status.backupUrl,
    };
  } catch (error) {
    keepRecoveryLease =
      externalWriteStarted &&
      error instanceof GoogleSyncError &&
      error.status === 504;
    const message = keepRecoveryLease
      ? "Google's update response timed out. Keep this device open and wait two minutes before syncing again while the previous request settles. Your local data is safe."
      : error instanceof GoogleSyncError
        ? error.message
        : "Google sync could not finish. Your local data is safe; try again.";
    if (!(error instanceof GoogleSyncError && error.code === "SYNC_CONFLICT")) {
      try {
        await store.save(lease, { last_error: message });
      } catch {
        /* A replaced connection must not be changed. */
      }
    }
    if (keepRecoveryLease) throw new GoogleSyncError(message, 504);
    throw error;
  } finally {
    try {
      if (!keepRecoveryLease) await store.release(lease);
    } catch {
      /* The lease expires even if the database is temporarily unavailable. */
    }
  }
}
