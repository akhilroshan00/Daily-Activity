# Daylight — Daily Activity

A Next.js learning planner with daily tasks, time allocation, carry-forward, focus sessions, weekly goals, yearly insights and portable backups. The interface includes a CSS 3D learning model, animated charts, depth effects and reduced-motion support. The login page comes first. Each Supabase account opens a separate workspace for tasks, daily inputs, focus sessions and weekly goals. Device-to-cloud sync remains explicit with a conflict review.

## Run the included project

Use Node.js 22 or 24. Extract this folder, open a terminal inside it, then run:

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The archive includes all source, configuration, a lockfile, tests, and the official SheetJS package under `vendor/`. It excludes installed dependencies and build output.

## Setup commands for a fresh project

The included project is already set up. These commands describe the equivalent starting point if you want to recreate it:

```bash
npx create-next-app@16.4.0 daily-activity --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd daily-activity
npm install --save-exact framer-motion@14.0.0 jspdf@4.2.1 jspdf-autotable@5.0.8 lucide-react@1.53.0 date-fns@4.4.0
npm install --save-exact https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm install --save-dev --save-exact tsx@4.23.15 prettier@3.9.9
```

Copy the provided source/configuration files into your fresh project. Prefer the included `package.json` and `package-lock.json`, followed by `npm ci`, to reproduce the tested dependency versions. The official SheetJS distribution is used instead of the older `xlsx` release on the npm registry. In the provided project it is vendored so Vercel's installation does not depend on the SheetJS CDN.

## Source map

| File                              | Responsibility                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/app/page.tsx`                | App Router page entry point                                                                                   |
| `src/app/layout.tsx`              | Metadata, global styles, theme initialization                                                                 |
| `src/components/calendar-app.tsx` | Calendar, navigation, monthly dashboard, report view, download buttons                                        |
| `src/components/day-modal.tsx`    | Animated daily editor, validation, holiday switch, remarks, time allocation                                   |
| `src/hooks/use-activity.ts`       | LocalStorage initialization, day saves, cross-tab updates, storage error handling                             |
| `src/lib/activity.ts`             | Calendar dates, holiday resolution, integer-minute arithmetic, monthly totals, export rows, schema validation |
| `src/lib/exports.ts`              | Lazy-loaded Excel/PDF generation and JSON backups                                                             |
| `src/app/globals.css`             | Tailwind entry point, theme tokens, glass surfaces, responsive layouts                                        |
| `tests/activity.test.ts`          | Tests of arithmetic, dates, input validation, storage and export row logic                                    |
| `DESIGN.md`                       | Design tokens, type choices, screen layout and interaction specification                                      |

## How the app behaves

Each day can include multiple tasks with independent status, minutes, priority, due date, subject, tags, resource link and notes. Statuses are **To do**, **In progress**, **Completed**, **Blocked** and **On hold**. New days calculate learning time from task minutes. Existing days retain their manual totals until you choose **Calculate from tasks**. Zero-minute tasks can be saved as plans without logging a working day. Use **Carry unfinished tasks** to copy saved tasks to another date with zero minutes; original history stays intact.

The editor shows completion progress, supports undoing draft removals, protects unsaved changes and refuses stale saves when another tab or focus session has changed the day. Search tasks, notes, subjects and tags in the activity list. Task exports carry individual statuses and timed allocations; any unassigned learning time appears in a Study row. All durations reconcile to the same daily totals.

The **Learning toolkit** below the calendar provides yearly learning charts, subject totals, focus timing, weekly goals and a working-day streak. Focus sessions persist across refreshes, save complete minutes, retain remaining seconds and guard against duplicate saves. The **Backups** tab previews imported JSON, offers an explicit preference for conflicting dates and downloads a safety backup before applying changes. Weekly goals and the live timer are local preferences; activity backups contain day and task data.

**Account & sync** uses the separate Daylight Supabase project in Mumbai. The included local environment is configured; `.env.example` documents the two public variables needed elsewhere. Never use a service-role key in frontend configuration. Create an account, confirm the email, then return to the app to sign in. Supabase's email redirect allowlist must include your app URL before deployment. Sync is manual: choose **Review sync**, select which version wins when a date exists on both sides, then **Merge & sync**. Revision checks reject concurrent cloud overwrites. Signing out closes the workspace and keeps entries under that account's local key. Another account starts with its own independent entries, timer and weekly goal. Saved sessions are verified before opening the planner; an account change remounts the planner to clear previous drafts and views. Access from another device requires opening the same app there; this repository has not been published to a public URL.

### Confirmation email setup and troubleshooting

The built-in Supabase mail service is intended for testing with project team members and currently allows only two emails per hour across the project. For registration by separate users, configure **Authentication > SMTP Settings** with your email provider's host, port, username, password and verified sender address. Store SMTP credentials only in Supabase settings. Then review **Authentication > Rate Limits** for your provider's capacity and **URL Configuration** for the exact app origin. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

If signup or resend reports that confirmation emails are unavailable, check your inbox and spam folder for a previous link, or wait for the email quota to reset. Retrying repeatedly cannot restore that quota. An already confirmed account can use **Sign in** with its existing password without sending a confirmation email. If sign-in asks you to confirm your email, follow the confirmation link first; if it cannot verify your credentials, check the email and registered password. The app distinguishes these failures from request throttling and connection errors. A synchronous request guard prevents overlapping submit/resend calls; changing the email clears confirmation advice for the previous address. Clicking the selected account tab preserves the entered password.

The home screen shows all 12 months with progress bars and annual learning, miscellaneous and logged-day totals. Click a month to open a separate daily log screen; use All months to return. Browser Back/Forward and refresh preserve the selected month through the URL. Switch between Daily calendar and Activity list, search notes or dates and filter by status, jump directly to a date, or log the next pending working day up to today. Use the previous/next year arrows to browse other years; saved activity remains available across months and years. PDF and Excel downloads cover the full selected month regardless of list filters; the all-months page also offers full-year downloads.

1. Open a day, enter learning hours from **0 to 9**, optionally add a remark, and save.
2. Each **saved working day** totals 9 hours: miscellaneous time = 9 hours minus learning time. For 4 hours learning, the app stores 240 learning minutes and 300 miscellaneous minutes.
3. Decimal hours are rounded to the nearest whole minute before calculation. For example, 4.33 hours becomes 4 hours 20 minutes. Integer minutes prevent cumulative floating-point drift.
4. Sundays default to holidays. You can override any Sunday to a working day, or mark any other day as a holiday using the small calendar button or the editor's switch.
5. Holidays contribute **0 learning and 0 miscellaneous hours**. Existing entries are retained and restored when the day becomes a working day again.
6. **Unlogged days remain pending** and contribute zero hours. Explicitly saving 0 learning hours records 9 miscellaneous hours. Future dates can be logged; a saved entry is considered completed regardless of date.
7. The dashboard and every export use the same functions for the selected month. The progress ring shows learning as a percentage of logged working hours. Days logged is compared to all working days in that month.
8. The editor uses a native dialog with keyboard focus containment, Escape dismissal, accessible labels, and an animated panel. Reduced-motion preferences are respected.

Older entries under the unassigned daylight.activity.v1 key are preserved and never assigned automatically. In **Learning toolkit > Backups**, use **Download older device backup**, then import it into the account that owns those entries. New users do not inherit the old device log. Browser storage is not encrypted and remains accessible through developer tools on that device; cloud access is enforced by database ownership policies.

## Excel mapping to your attached workbook

Use **Colour** in the top toolbar to choose Violet, Ocean, Emerald, Teal, Rose or Amber. The preference applies to both light and dark mode, including the charts and 3D graphics, and is saved on this browser as `daylight.colour`. Open tabs share colour changes; **Reset to default** restores Violet. This appearance preference is separate from activity backups and account sync.

The reference workbook was inspected locally. Its title is at C4 and its required header columns begin at **B8**. The export preserves this layout, with data starting at **B9**:

| Excel column | Header     | Exported content                                            |
| ------------ | ---------- | ----------------------------------------------------------- |
| B            | DATE       | Date formatted `dd/MM/yyyy`                                 |
| C            | DAY        | Uppercase weekday                                           |
| D            | Activity   | Learning task, Study, Miscellaneous, Holiday, or Not logged |
| E            | START TIME | Allocated block start, e.g. 9:00 AM                         |
| F            | END TIME   | Allocated block end, e.g. 1:00 PM                           |
| G            | HRS        | Numeric duration in hours, displayed to 2 decimal places    |
| H            | STATUS     | Task status, Hours logged, Completed, Holiday, or Pending   |
| I            | REMARK     | Learning/holiday note, or a miscellaneous-work description  |

Learning is allocated from **9:00 AM**; miscellaneous work follows until **6:00 PM**. These are generated allocation blocks, not independently recorded start/end timestamps. A 4-hour entry exports Study 9:00 AM–1:00 PM and Miscellaneous 1:00 PM–6:00 PM. Zero-length activity rows are omitted.

Every date in the selected month appears in the report. Holiday and pending rows have blank start/end times and numeric zero duration. Recalculable SUM/SUMIF totals appear below the table. The template's unused `Column1` is omitted as requested. The export preserves the required structure and column order; it does not reproduce every original Excel cell style. The uploaded workbook's historic entries are not automatically imported or included in the app.

## PDF export

A landscape A4 report contains the same eight columns, a monthly summary, striped rows, repeating headers and page numbers. Long remarks wrap and reports may span several pages. It embeds bundled DejaVu Sans regular/bold fonts so its appearance remains consistent across PDF viewers. Text is limited to ASCII for dependable script rendering; unsupported characters are replaced with `?` and an explanatory note is added. Excel and JSON preserve multilingual remarks exactly. For a PDF with Malayalam or other scripts, add a suitable embedded font and script shaping support.

## Sign-in troubleshooting

The form shows sign-in errors directly above the fields. If your email is unconfirmed, check your inbox and spam folder or use **Resend confirmation email**. Use the email address and password entered at registration. Repeated auth events no longer restart verification, and stalled checks return to the form with a timeout message. When running on localhost:3002, include http://localhost:3002 in Supabase Auth''s allowed redirect URLs so email links return to this app. Real email delivery and browser sign-in still require an acceptance test.

## Persistence and backup

- Activities use `daylight.activity.v1:USER_ID`; focus state uses `daylight.focus.v1:USER_ID`; weekly goals use `daylight.weekly-goal:USER_ID`. Theme and colour are shared appearance preferences on this browser.
- Existing valid data is loaded before editing is enabled. Invalid data is left intact and writes are blocked to protect it.
- Other tabs update when the browser fires a storage event. Saves read the latest persisted data before updating a day. An editor opened before another update refuses a stale save; reopen the day to review its latest version.
- If storage is blocked or full, new entries stay in memory and a warning asks you to download a backup. A reload loses session-only entries.
- **Back up all data** downloads a versioned JSON backup of all months. If the stored file is corrupt, it downloads those original bytes for recovery.
- LocalStorage belongs to the particular browser, profile, and site origin. It does not sync between devices. Clearing site data removes entries; localhost, Vercel preview URLs and your production domain each have separate storage.

To restore a valid JSON backup, open **Learning toolkit > Backups**, choose the JSON file, review its counts and date conflicts, then select your conflict preference and restore. The app validates the complete backup and downloads your current activities before applying it. Keep an untouched copy of your backup.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

The automated tests cover 4 + 5 hours, empty days, Sunday overrides, holiday exclusion/restoration, 0/9-hour boundaries, invalid inputs, rounding, month separation, leap years, multilingual remarks and invalid storage.

## Deploy on Vercel

### Git import

1. Create your GitHub repository and push this **project folder** including `src/`, config files, `package.json`, `package-lock.json` and `vendor/`.
2. In Vercel, choose **Add New → Project**, import the repository, and select **Next.js**. Select the directory containing this app's package.json and src folder. The inner daily-activity folder in this workspace is a separate starter project.
3. Choose Node.js **24.x** (22.x also works), leave the framework defaults, and click **Deploy**. Login is required. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.example, and allow the deployment origin in Supabase Auth redirect settings.

```bash
git init
git add .
git commit -m "Build daily activity calendar"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/daily-activity.git
git push -u origin main
```

Use your actual repository URL. Every later push can trigger a new deployment through Vercel's Git integration.

### CLI

```bash
npx vercel login
npx vercel
# Check the preview, then deploy production:
npx vercel --prod
```

Choose your intended team and a new project during the CLI setup. The Daylight Supabase backend has been created; the frontend has not been deployed.

Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## Figma and Supabase

Design values are documented in `DESIGN.md` and owned by CSS tokens, so the layout can be recreated in an editable Figma file. No Figma reference file was supplied; no remote Figma file was created. The app requires login before opening a workspace. Each account has separate local activity storage; manual cloud sync uses the separate Daylight Supabase project with owner-only database policies. The database schema is documented in supabase/daylight_schema.sql.
