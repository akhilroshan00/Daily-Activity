import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const GOOGLE_COOKIE = "daylight-google-oauth";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "openid",
];
export const GOOGLE_TABLE = "daylight_google_connections";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GoogleSyncError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: "SYNC_BUSY" | "SYNC_CONFLICT",
  ) {
    super(message);
    this.name = "GoogleSyncError";
  }
}

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  redirectUri: string;
  encryptionKey: Buffer;
};

export function googleConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleConfig {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.APP_URL ||
    !env.GOOGLE_TOKEN_ENCRYPTION_KEY
  )
    throw new GoogleSyncError(
      "Google sync needs its server configuration. Ask the app owner to complete Google setup.",
      503,
    );
  let app: URL;
  try {
    app = new URL(env.APP_URL);
  } catch {
    throw new GoogleSyncError(
      "The app owner must configure a valid APP_URL for Google sync.",
      503,
    );
  }
  if (
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== "/" ||
    (app.protocol !== "https:" &&
      !(
        app.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(app.hostname)
      ))
  )
    throw new GoogleSyncError(
      "APP_URL must be the app's HTTPS origin, or localhost for development.",
      503,
    );
  const encryptionKey = Buffer.from(env.GOOGLE_TOKEN_ENCRYPTION_KEY, "base64");
  if (
    encryptionKey.length !== 32 ||
    encryptionKey.toString("base64") !== env.GOOGLE_TOKEN_ENCRYPTION_KEY
  )
    throw new GoogleSyncError(
      "The app owner must configure a 32-byte base64 Google encryption key.",
      503,
    );
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    appUrl: app.origin,
    redirectUri: `${app.origin}/api/google/callback`,
    encryptionKey,
  };
}

export function parseSpreadsheetUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw new GoogleSyncError(
      "Paste the URL of an existing Google spreadsheet.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GoogleSyncError("Paste a valid Google spreadsheet URL.");
  }
  const match = /^\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,200})(?:\/|$)/.exec(
    url.pathname,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    !match
  )
    throw new GoogleSyncError(
      "Use a https://docs.google.com/spreadsheets/d/... URL.",
    );
  return match[1];
}

export function sealGoogleSecret(
  value: unknown,
  key: Buffer,
  userId: string,
  purpose: "connection" | "oauth",
): string {
  if (key.length !== 32 || !UUID.test(userId))
    throw new GoogleSyncError("Invalid Google encryption configuration.", 503);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`daylight:${purpose}:v1:${userId}`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    userId,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function openGoogleSecret<T>(
  sealed: string,
  key: Buffer,
  userId: string,
  purpose: "connection" | "oauth",
): T {
  try {
    const [version, owner, iv, tag, encrypted, extra] = sealed.split(".");
    if (
      version !== "v1" ||
      owner !== userId ||
      !UUID.test(owner) ||
      extra !== undefined ||
      !iv ||
      !tag ||
      !encrypted
    )
      throw new Error("Invalid envelope");
    const nonce = Buffer.from(iv, "base64url"),
      authTag = Buffer.from(tag, "base64url");
    if (nonce.length !== 12 || authTag.length !== 16)
      throw new Error("Invalid envelope");
    const cipher = createDecipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(`daylight:${purpose}:v1:${userId}`));
    cipher.setAuthTag(authTag);
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(encrypted, "base64url")),
        cipher.final(),
      ]).toString("utf8"),
    ) as T;
  } catch {
    throw new GoogleSyncError(
      "Google authorization could not be verified. Connect Google again.",
      401,
    );
  }
}

export type GoogleOAuthState = {
  userId: string;
  accessToken: string;
  state: string;
  verifier: string;
  spreadsheetId: string;
  expiresAt: number;
};

export function createGoogleOAuth(
  config: GoogleConfig,
  userId: string,
  accessToken: string,
  spreadsheetId: string,
  now = Date.now(),
) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const payload: GoogleOAuthState = {
    userId,
    accessToken,
    state,
    verifier,
    spreadsheetId,
    expiresAt: now + 8 * 60_000,
  };
  const cookie = sealGoogleSecret(
    payload,
    config.encryptionKey,
    userId,
    "oauth",
  );
  if (cookie.length > 3800)
    throw new GoogleSyncError(
      "Your sign-in token is too large to start Google authorization. Please sign in again.",
      400,
    );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie };
}

export function verifyGoogleOAuth(
  cookie: string,
  state: string | null,
  config: GoogleConfig,
  now = Date.now(),
): GoogleOAuthState {
  const owner = cookie.split(".")[1] ?? "";
  const payload = openGoogleSecret<GoogleOAuthState>(
    cookie,
    config.encryptionKey,
    owner,
    "oauth",
  );
  const supplied = Buffer.from(state ?? ""),
    expected = Buffer.from(payload.state ?? "");
  if (
    !UUID.test(payload.userId) ||
    payload.userId !== owner ||
    !payload.accessToken ||
    typeof payload.verifier !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.verifier) ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(payload.spreadsheetId) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= now ||
    payload.expiresAt > now + 8 * 60_000 ||
    expected.length !== 43 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new GoogleSyncError(
      "Google authorization expired or did not match. Connect Google again.",
      401,
    );
  return payload;
}

export function assertGoogleOrigin(request: Request, appUrl: string) {
  if (
    request.headers.get("origin") !== appUrl ||
    new URL(request.url).origin !== appUrl
  )
    throw new GoogleSyncError(
      "Google sync requests must come from this app.",
      403,
    );
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw new GoogleSyncError(
      "Google sync requests must come from this app.",
      403,
    );
}

export type GoogleIdentity = {
  userId: string;
  accessToken: string;
  db: SupabaseClient;
};
export async function verifyGoogleUser(
  accessToken: string,
): Promise<GoogleIdentity> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new GoogleSyncError(
      "Sign-in has not been configured by the app owner.",
      503,
    );
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    },
  });
  let result;
  try {
    result = await db.auth.getUser(accessToken);
  } catch {
    throw new GoogleSyncError(
      "Could not verify your sign-in. Please try again.",
      503,
    );
  }
  if (result.error || !result.data.user || !UUID.test(result.data.user.id))
    throw new GoogleSyncError(
      "Please sign in again before using Google sync.",
      401,
    );
  return { userId: result.data.user.id, accessToken, db };
}

export async function googleIdentity(
  request: Request,
): Promise<GoogleIdentity> {
  const match = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match || match[1].length > 16_000)
    throw new GoogleSyncError("Sign in to use Google sync.", 401);
  return verifyGoogleUser(match[1]);
}

export async function readGoogleBody(
  request: Request,
  limit = 2 * 1024 * 1024,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new GoogleSyncError("Send Google sync data as JSON.", 415);
  if (Number(request.headers.get("content-length")) > limit)
    throw new GoogleSyncError(
      "This backup is too large to sync (maximum 2 MB).",
      413,
    );
  const reader = request.body?.getReader();
  if (!reader) throw new GoogleSyncError("Missing sync data.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new GoogleSyncError(
          "This backup is too large to sync (maximum 2 MB).",
          413,
        );
      }
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Invalid JSON");
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GoogleSyncError) throw error;
    throw new GoogleSyncError("The Google sync request contains invalid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export function googleErrorResponse(error: unknown) {
  const known = error instanceof GoogleSyncError;
  return Response.json(
    {
      error: known
        ? error.message
        : "Google sync could not finish. Your local data is safe; try again.",
      ...(known && error.code ? { code: error.code } : {}),
    },
    {
      status: known ? error.status : 502,
      headers: {
        "Cache-Control": "no-store",
        ...(known && error.status === 409 ? { "Retry-After": "5" } : {}),
      },
    },
  );
}

export function googleCookieHeader(
  value: string,
  config: GoogleConfig,
  clear = false,
) {
  return `${GOOGLE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/google/callback; Max-Age=${clear ? 0 : 480}${config.appUrl.startsWith("https:") ? "; Secure" : ""}`;
}
