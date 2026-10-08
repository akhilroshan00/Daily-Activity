# Security and logic review — 8 October 2026

## Credentials

No exposed credentials were detected in the tracked source, locally available
Git history (including the nested starter repository), or production browser
JavaScript. `.env.local` is ignored by Git. The scan checks recognizable private
keys and provider tokens, Supabase service-role JWTs, and exact matches for the
private credentials loaded from the local environment. It reports locations
without printing secret values. Supabase's publishable key is intentionally
public; a service-role key must never be public.

Repeat the read-only scan after a production build:

```powershell
node --env-file=.env.local scripts/audit-secrets.mjs
```

This is a heuristic review, not a guarantee that no credential has ever leaked.
It does not cover remote branches unavailable locally, hosting logs, external
services, or every possible token format.

## Fixed logic bug

Cloud sync previously reapplied the uploaded snapshot after receiving its
response. It preserved entries edited during the upload but could restore a
date removed locally during that interval, for example through replacing a
workspace from a backup. The merge now preserves concurrent local deletions,
edits, and additions, while keeping remote-only dates and the user's reviewed
conflict choices for unchanged dates. Two regression tests cover this behavior.
Pending local changes still need a subsequent sync to reach another device.

## Open findings

- `npm audit --omit=dev` reports **zero runtime dependency vulnerabilities**.
  The full audit reports **five high-severity findings in the development lint
  dependency chain**, stemming from `braces`. The
  [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  lists no patched version. No forced downgrade of the matching Next.js lint
  configuration was made. Recheck the advisory when an upstream fix is released.
- Daylight's live Supabase security advisor reports **leaked-password protection
  disabled**, and no other security warnings in that advisor result. This is a
  missing breached-password check, not evidence of a leaked credential. See
  [Supabase's password-security settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  for availability and configuration. No paid plan or live authentication setting
  was changed during this audit.

## Verification and limits

The automated tests cover authentication state transitions, account storage
isolation, daily-entry validation, backup/export calculations, and Google sync
authorization and concurrency. All **82 tests** pass. ESLint and the production
build are checked with this change.

Live Google OAuth, real confirmation-email delivery, and the full browser login
flow were not exercised in this review. Google integration still needs its
OAuth client credentials before a real per-user Sheets/Drive sync can be tested.
