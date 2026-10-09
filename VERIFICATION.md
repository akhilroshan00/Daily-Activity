# Verification

Checked on 8 October 2026 for the expanded Daylight app in the outer project folder.

| Check                         | Result                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `npm run build`               | Passed, including TypeScript and static page generation                              |
| `npm run lint`                | Passed                                                                               |
| `npm test`                    | All 68 regression tests passed                                                       |
| `npm audit --omit=dev --json` | Zero reported runtime dependency vulnerabilities                                     |
| Supabase project              | Separate Daylight project created in Mumbai with the user-confirmed $0/month quote   |
| Database access               | Row-level security enabled, four owner-only policies, anonymous table access revoked |
| Supabase security advisors    | No Google table/RLS notices; Auth leaked-password protection is disabled               |

Regression tests cover legacy data compatibility, multiple tasks and statuses, task metadata validation, planned days, manual and task-derived totals, holiday handling, month/year boundaries, leap years, and export allocations that reconcile to nine-hour working days. They also cover carry-forward without duplicate time, distinct tasks with identical titles, duplicate focus-save prevention, focus time on planned manual days, time limits, suspended timers and backward clock changes, backup conflict choices, Monday-based weekly totals, and holiday-aware streaks.

The final review also corrected stale day saves, session-only storage updates, trailing-comma tag entry, focus-session metadata preservation, zero-minute goal rounding, and task-mode save labels. Cloud writes use a revision check; dates present on both sides use the conflict preference selected during review. These client flows have been reviewed in code; the regression suite does not simulate every browser interaction or cloud request.

The login-first update also passed lint, TypeScript, all 28 tests and the production build. Storage regression tests exercise the application''s read/write functions for two distinct account IDs and verify that legacy data, focus state and weekly goals do not leak into the other account''s workspace. A real database transaction created two temporary users and workspaces, verified owner reads in both directions, and checked that cross-account reads, updates, deletes, foreign-owner inserts and owner reassignment were blocked. The entire transaction was rolled back; no test accounts or data were retained. Signup display names are for presentation only and are never used for ownership checks.

The login-loop fix adds nine regression cases for repeated sign-in events, stale initial-session callbacks, account-switch races (including switching back), sign-out and unmount guards, failed verification, missing initial events, request timeouts and actionable credential errors. Session verification now uses the event''s access token directly, deduplicates pending checks and exits loading after 15 seconds. Auth HTTP requests abort after 12 seconds. Login errors appear above the fields; unconfirmed accounts can request another confirmation email. Recent aggregated Supabase auth logs showed email_not_confirmed and invalid_credentials rejections. No confirmation emails were sent by the agent while testing.

The confirmation-error review found seven `/signup` HTTP 429 responses with `over_email_send_rate_limit` in the aggregated auth logs, plus password-token failures for unconfirmed email addresses and invalid credentials. The previous error mapper incorrectly described the signup email quota as a sign-in outage. It now distinguishes email delivery limits from action-specific request throttling. Two additional regression cases cover email-quota HTTP 429 precedence (signup, resend and login) and session-verification throttling exiting the loading screen. The form also guards overlapping requests, preserves passwords when clicking the selected tab, clears password visibility when switching modes and removes stale confirmation advice when the email changes. Signup success copy no longer asserts that a new account was created when the provider may return an opaque response for an existing address.

No SMTP configuration or provider quota was changed. These frontend fixes cannot reset Supabase's email quota. The README documents custom SMTP setup required for general user registration and distinguishes confirmed-account login from confirmation-dependent signup. No test emails were sent.

The per-user Google integration adds verified-bearer API routes, account/purpose-bound encrypted OAuth state and tokens, separate managed spreadsheet tabs, and a Drive JSON backup per connection. The Google account subject is checked during consent; switching Google accounts resets the old target identifiers without deleting the old files. Explicit origins, streamed payload limits, literal string cells, owner-only policies, a database lease, canonical snapshot hashes and revision checks protect the save flow. Partial writes invalidate the acknowledgement; reverting to an earlier log or manually syncing unchanged entries repairs both files. An uncertain timed-out write retains a short recovery lease and is never marked successful.

The Google connection schema was applied to Daylight. A real rolled-back transaction verified both owners' reads, blocked foreign reads/updates/deletes/inserts and owner reassignment, denied anonymous access, and rejected a second active lease claim. A follow-up query confirmed zero retained test users and zero connected Google accounts. The security advisor reported only disabled leaked-password protection in Auth; enabling that account setting was not part of this change. See [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Google API tests use mocked external responses to cover partial-write recovery, stale snapshots, missing tabs, refresh tokens, permissions, encrypted state, account changes, timeouts and sanitized errors. They verify the actual writer functions but do not establish that a real OAuth consent or Google write has occurred. Browser-side queue tests cover coalescing, bounded retry, paused sync, sign-out cancellation and repair after partial failure.

Daily quote tests verify stable date selection, leap dates, invalid date rejection and built-in fallback for failed or malformed API content. The quote component is present both in the calendar and each day's editor. The reported hydration diff was traced to browser extension `eppiocemhmnlbhjplcgkofciiegomcon`; application-owned attributes and initial auth rendering are consistent. The extension must be disabled for the app domain to remove its injected mismatch.

An isolated production server returned HTTP 200 for the home page with no `bis_*` attributes or extension script in its HTML. `/api/quote?date=2026-10-08` returned a real DummyJSON quote with HTTP 200; the invalid date `2026-02-29` returned HTTP 400. An unauthenticated request to `/api/google/status` returned HTTP 401. The server was stopped after checking. The production build initially hit a transient OneDrive output lock; the retry completed successfully. Sidebar profile names and initials now come from the signed-in user's display name.

## Remaining verification

The follow-up login review confirmed that Daylight's Supabase project is active
and its Auth health endpoint returns HTTP 200. Recent Auth logs showed rejected
password credentials, repeated signup requests and used/expired confirmation
links. The app now includes password reset requests, a verified recovery-session
password form, account-bound recovery continuation across tab reloads, and clear
email-link redirect errors. Five regression cases cover recovery event races,
event deduplication, sign-out/account changes, verification failure, safe redirect
messages and reset-specific email quotas. No real user's password was changed
and no reset email was sent during automated verification. Actual email delivery
and browser completion of a password reset still require a manual pass.

No controllable browser was available for this update. The new visual layout, mobile widths, keyboard flows, refresh/cross-tab behavior, and actual PDF/Excel downloads therefore need a fresh browser pass. Previous screenshots and browser checks of the older interface do not verify this version. Email confirmation, real account sign-in, concurrent-device cloud conflicts, and sync between two devices have not been tested end to end. Google OAuth server credentials and a real user consent are still missing; automatic Google writes cannot run until [Google setup](GOOGLE_SYNC_SETUP.md) is completed by the app owner and each user connects their own sheet.

Before deployment, include the app's exact origin in Supabase's allowed redirect URLs and configure the two public variables from `.env.example` in the hosting environment. The frontend has not been deployed publicly. Weekly goals and live timer state are local preferences; only day/task entries are backed up and synced.

The full dependency audit reports five high-severity findings in the development-only lint chain (`braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, and `eslint-config-next`). The installed `braces` release is the latest available release checked during this update, with no compatible patched release available. The suggested forced Next.js lint downgrade was not applied. See the [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Runtime dependencies have a clean audit; the development findings remain open.

## Manual acceptance pass

1. Run the outer project and open a month, then a day. Add several tasks with different statuses, times, tags, subjects and a resource URL; save and reload.
2. Confirm task-derived totals, switch to manual totals, and toggle a holiday off and on. Compare the monthly and yearly PDF/Excel totals with the dashboard.
3. Carry unfinished tasks twice to the same date and confirm the second action cannot duplicate them. Check original history and target minutes.
4. Start a focus timer, reload, pause, and save. Check that whole minutes are added once and remaining seconds are retained. Try a session exceeding nine hours.
5. Preview and restore a JSON backup with conflicting dates using each preference. Keep the automatically downloaded safety backup.
6. Review the calendar, editor and toolkit at desktop and narrow mobile widths, using keyboard navigation and reduced motion.
7. Create and confirm two accounts. Sign in as each, create distinct tasks and goals, and sign out or switch accounts in another tab; confirm the login screen and independent inputs. Recover any older unassigned log through Backups. Review and sync each account. Open the same app on another device and retrieve the entries; test a competing update before committing a reviewed revision.

## Task time fields and test runner — 9 October 2026

Added optional From time and To time pickers below each task’s notes. The saved entry decoder preserves both fields, allows empty times for existing tasks, validates 24-hour HH:mm values, and rejects a To time that is not later than From time. These fields record the task’s time range; daily learning hours remain the existing separate input.

The tsx test loader failed in this restricted Windows environment because its IPC setup calls node:os.userInfo(), which returned uv_os_get_passwd ENOMEM. The test command now registers a small TypeScript loader using node:module and the installed TypeScript compiler, avoiding that IPC setup. It retains the native Node test runner and inline source maps. Type checking remains a separate check.

Validation: all 83 regression tests passed, full-project ESLint passed, TypeScript passed, and the production Next.js build passed. The new regression case covers time persistence, empty fields, invalid values, and reversed or equal ranges. No browser interaction or real cloud sync was verified during this change.
