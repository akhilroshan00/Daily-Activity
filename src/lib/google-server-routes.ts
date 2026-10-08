import { decodeEntries, encodeEntries, type Entries } from "./activity";
import {
  GOOGLE_COOKIE,
  GoogleSyncError,
  assertGoogleOrigin,
  createGoogleOAuth,
  googleConfig,
  googleCookieHeader,
  googleErrorResponse,
  googleIdentity,
  openGoogleSecret,
  parseSpreadsheetUrl,
  readGoogleBody,
  sealGoogleSecret,
  verifyGoogleOAuth,
  verifyGoogleUser,
} from "./google-server";
import {
  exchangeGoogleCode,
  googleConnectionStore,
  googlePublicStatus,
  googleReconnectValues,
  syncGoogleSnapshot,
  type GoogleTokens,
} from "./google-server-sync";

const noStore = { "Cache-Control": "no-store" };

export async function googleStatusGet(request: Request) {
  try {
    const identity = await googleIdentity(request);
    let config;
    try {
      config = googleConfig();
    } catch (error) {
      if (!(error instanceof GoogleSyncError)) throw error;
      return Response.json(
        {
          configured: false,
          connected: false,
          autoSync: false,
          spreadsheetUrl: null,
          backupUrl: null,
          lastSyncedAt: null,
          revision: 0,
          snapshotHash: null,
          error: error.message,
        },
        { headers: noStore },
      );
    }
    if (new URL(request.url).origin !== config.appUrl)
      throw new GoogleSyncError(
        "Open the app at its configured APP_URL to use Google sync.",
        400,
      );
    return Response.json(
      googlePublicStatus(await googleConnectionStore(identity).get()),
      { headers: noStore },
    );
  } catch (error) {
    return googleErrorResponse(error);
  }
}

export async function googleStatusPatch(request: Request) {
  try {
    const config = googleConfig();
    assertGoogleOrigin(request, config.appUrl);
    const identity = await googleIdentity(request);
    const body = await readGoogleBody(request, 1024);
    if (typeof body.autoSync !== "boolean")
      throw new GoogleSyncError(
        "Choose whether automatic sync should be enabled.",
      );
    const store = googleConnectionStore(identity),
      { lease } = await store.acquire();
    try {
      const row = await store.save(lease, { auto_sync: body.autoSync });
      return Response.json(googlePublicStatus(row), { headers: noStore });
    } finally {
      await store.release(lease);
    }
  } catch (error) {
    return googleErrorResponse(error);
  }
}

export async function googleConnectPost(request: Request) {
  try {
    const config = googleConfig();
    assertGoogleOrigin(request, config.appUrl);
    const identity = await googleIdentity(request);
    const body = await readGoogleBody(request, 4096);
    const spreadsheetId = parseSpreadsheetUrl(body.spreadsheetUrl);
    const row = await googleConnectionStore(identity).get();
    if (
      row?.sync_lock &&
      row.lock_expires_at &&
      Date.parse(row.lock_expires_at) > Date.now()
    )
      throw new GoogleSyncError(
        "Another Google sync is running. Try again shortly.",
        409,
        "SYNC_BUSY",
      );
    const oauth = createGoogleOAuth(
      config,
      identity.userId,
      identity.accessToken,
      spreadsheetId,
    );
    return Response.json(
      { url: oauth.url },
      {
        headers: {
          ...noStore,
          "Set-Cookie": googleCookieHeader(oauth.cookie, config),
        },
      },
    );
  } catch (error) {
    return googleErrorResponse(error);
  }
}

export async function googleConnectDelete(request: Request) {
  try {
    const config = googleConfig();
    assertGoogleOrigin(request, config.appUrl);
    const identity = await googleIdentity(request),
      store = googleConnectionStore(identity);
    if (!(await store.get()))
      return Response.json(
        { connected: false },
        {
          headers: {
            ...noStore,
            "Set-Cookie": googleCookieHeader("", config, true),
          },
        },
      );
    const { row, lease } = await store.acquire();
    let refreshToken: string | undefined;
    try {
      try {
        refreshToken = openGoogleSecret<GoogleTokens>(
          row.token_ciphertext,
          config.encryptionKey,
          identity.userId,
          "connection",
        ).refreshToken;
      } catch {
        /* Disconnect also works if the encryption key changed. */
      }
      await store.remove(lease);
    } finally {
      await store.release(lease);
    }
    if (refreshToken) {
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        /* Local credentials have been removed; files are intentionally preserved. */
      }
    }
    return Response.json(
      { connected: false },
      {
        headers: {
          ...noStore,
          "Set-Cookie": googleCookieHeader("", config, true),
        },
      },
    );
  } catch (error) {
    return googleErrorResponse(error);
  }
}

export async function googleCallbackGet(request: Request) {
  const url = new URL(request.url);
  let destination = new URL("/?google_sync=error", url.origin).toString();
  let clearCookie = `${GOOGLE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/google/callback; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`;
  try {
    const config = googleConfig();
    destination = `${config.appUrl}/?google_sync=error`;
    clearCookie = googleCookieHeader("", config, true);
    if (url.origin !== config.appUrl || url.searchParams.has("error"))
      throw new GoogleSyncError("Google authorization was cancelled.", 400);
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${GOOGLE_COOKIE}=`))
      ?.slice(GOOGLE_COOKIE.length + 1);
    const code = url.searchParams.get("code");
    if (!cookie || !code || code.length > 4096)
      throw new GoogleSyncError("Missing Google authorization.", 401);
    const state = verifyGoogleOAuth(
      cookie,
      url.searchParams.get("state"),
      config,
    );
    const identity = await verifyGoogleUser(state.accessToken);
    if (identity.userId !== state.userId)
      throw new GoogleSyncError(
        "Google authorization belongs to another workspace.",
        401,
      );
    const store = googleConnectionStore(identity),
      existing = await store.get();
    const lock = existing ? await store.acquire() : null;
    try {
      const tokens = await exchangeGoogleCode(config, code, state.verifier);
      const ciphertext = sealGoogleSecret(
        tokens,
        config.encryptionKey,
        identity.userId,
        "connection",
      );
      if (lock) {
        await store.save(
          lock.lease,
          googleReconnectValues(
            config,
            identity.userId,
            lock.row,
            tokens,
            state.spreadsheetId,
          ),
        );
      } else {
        await store.insert({
          user_id: identity.userId,
          token_ciphertext: ciphertext,
          spreadsheet_id: state.spreadsheetId,
        });
      }
    } finally {
      if (lock) await store.release(lock.lease);
    }
    destination = `${config.appUrl}/?google_sync=connected`;
  } catch {
    /* Never put upstream errors, codes or credentials in the redirect URL. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      ...noStore,
      Location: destination,
      "Set-Cookie": clearCookie,
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function googleSyncPost(request: Request) {
  try {
    const config = googleConfig();
    assertGoogleOrigin(request, config.appUrl);
    const identity = await googleIdentity(request);
    const body = await readGoogleBody(request);
    if (
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 0
    )
      throw new GoogleSyncError(
        "Refresh the Google sync status before sending this backup.",
      );
    let entries: Entries;
    try {
      entries = decodeEntries(encodeEntries(body.entries as Entries));
    } catch {
      throw new GoogleSyncError(
        "The backup contains invalid activity data. Your saved data has been left intact.",
      );
    }
    const result = await syncGoogleSnapshot(
      config,
      identity,
      entries,
      body.expectedRevision as number,
    );
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return googleErrorResponse(error);
  }
}
