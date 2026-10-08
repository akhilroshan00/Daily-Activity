# Google Sheets and Drive automatic updates

Daylight mirrors each connected user's saved daily log into two dedicated tabs
in that user's chosen Google Sheet. It also maintains one full JSON backup in
that user's Google Drive. Existing spreadsheet tabs are preserved. This is a
one-way copy from Daylight: edit tasks in the app, because later saves replace
the managed tabs and backup. Google Drive stores a file backup; it is not a
transactional database.

The Google connection in Codex lets the assistant access your files. Daylight
needs its own OAuth consent to keep updating them when you use the app later.
No live Google connection is included in this repository.

Each Daylight account must connect its own Google account and choose its own
spreadsheet. Connections, refresh tokens, target tab IDs, backup file IDs and
sync revisions are scoped to the verified Daylight user. For private logs,
choose a separate private spreadsheet: Google sharing settings still control
who else can view a file that you share.

## App owner setup

1. In the [Google Cloud console](https://console.cloud.google.com/), create or
   select a project and enable the Google Sheets API and Google Drive API.
2. Configure the Google Auth Platform consent screen for Daylight. While the
   app is in Testing, add the Google accounts you want to use as test users.
3. Create an OAuth client with type **Web application**. Add the exact callback
   URL, for example `http://localhost:3000/api/google/callback`, to authorized
   redirect URIs. Use the deployed HTTPS origin for production.
4. Set the following server environment variables in `.env.local` locally and
   in your hosting environment for deployment:

   ```dotenv
   APP_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_TOKEN_ENCRYPTION_KEY=your-32-byte-base64-key
   ```

   Generate the encryption key once with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Keep this key unchanged while connections exist. Losing or changing it
   requires users to connect Google again. These values stay on the server;
   never prefix the secret or encryption key with `NEXT_PUBLIC_`, commit them,
   or put them in a Google Sheet.
5. Apply [the Google connection schema](supabase/google_sync_schema.sql) to
   your Supabase project if it has not already been applied. The existing two
   public Supabase environment variables remain required. Google connections
   use owner-only row policies and encrypted token storage.
6. Restart the app. Each user can open **Google Sheets & Drive > Set up sync**,
   paste a sheet URL they can edit, then choose **Connect Google & enable
   updates** and complete Google's consent screen.

The requested scopes are Sheets access for the existing spreadsheet selected
by URL, `drive.file` for the backup created by Daylight, and `openid` to recognize
the connected Google account when reconnecting. The app does not
request access to Gmail or all Drive files. Sheets access is broader than the
chosen sheet; the app writes only to its stored target and managed tab IDs.
For public distribution, follow Google's consent and verification requirements.
Testing-mode refresh tokens for these scopes generally expire after seven days,
so test users may need to reconnect.

## What happens after saving

- Changes saved in the day editor, holiday controls, carry-forward, imported
  activities and completed focus sessions queue an update while Daylight is
  open. Unsaved drafts, running timers, weekly goals and colour preferences
  are not uploaded.
- Rapid edits are combined and requests are serialized. Temporary network,
  quota or server failures retain local entries and retry a bounded number of
  times. When the connection returns, pending entries can sync again.
- Both the Sheet and Drive backup must succeed before the app reports a
  completed Google save. Retrying updates the same tabs and backup file instead
  of appending duplicate task rows or creating a new backup each time.
- If a write times out after Google may have accepted it, the connection holds
  a short recovery lease before another upload is allowed. A timeout is never
  reported as a completed save. Retry after the recovery window to reapply the
  latest device snapshot. Sheets and Drive are separate services; the updates
  are not a single transaction across both files.
- A revision check protects against a stale device overwriting a newer Google
  copy. Review the sheet before choosing **Use this device's entries**. If you
  need remote data, download the Drive JSON backup and import it using Daylight's
  Backups tool before replacing the copy.
- Updates pause if device storage could not be safely read. Download a local
  backup and resolve the storage warning first. Disconnecting Google keeps
  existing Google files and your local activity log.

## Verify your connection

Connect a test sheet and save a day with two tasks. Check that each task has
its own row, the daily total appears once, and the Drive JSON can be restored
through Backups. Edit a status, remove a task, and save again: rows should be
updated without duplication. Confirm any original sheet tabs remain intact.
Pause automatic updates, save, then use **Sync now**. Test offline recovery and
a stale second device before relying on the connection for important logs.

References: [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Drive permissions](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[Sheets API limits](https://developers.google.com/workspace/sheets/api/limits).
