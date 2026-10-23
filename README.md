# Daylight — Daily Activity

A Next.js activity tracker with a simple daily log, weekly goals, yearly insights and portable backups. Each Supabase account opens a separate workspace. Device-to-cloud sync remains explicit with a conflict review.

Spreadsheet activities imported into an account are added to that account's
device log automatically when the workspace opens. Existing tasks and notes
are kept, and import receipts prevent duplicates or restoring tasks you later
delete. Other cloud changes continue to use the explicit sync review.

Open a day, choose an activity, enter start/end times, and save. The separate task
editor, manual learning-hours controls, sliders and carry panel have been removed.
Optional notes and time-splitting stay collapsed. Learning includes batches,
teaching and free time; huddles and meetings count as miscellaneous. Lunch is fixed
at 13:30-14:30 on working days and excluded from both groups. Work is learning plus
miscellaneous; total logged time adds breaks, without counting subcategories twice. Untimed
gaps stay unlogged. Overlapping or backwards activities are rejected on save.
Edited logs use `timeMode: activities`: totals come exclusively from the activity
log, while historical tasks and focus receipts remain intact in backups/history.
Weekday/weekend templates are optional. Original manual/task allocations and
spreadsheet ranges remain stored, while reports apply the current lunch and category
rules. Notes-only edits and changing leave/holiday status retain the source history.
Leave and holidays preserve activities and contribute zero hours. Account
ownership, authentication and database tables are unchanged.

Excel reports include daily category totals, learning topics, task details and a
validated restore snapshot; Excel reimport keeps existing activities on matching
dates. JSON/cloud/Drive backups retain the complete time log. Google Sheets daily
rows include category totals and activity details alongside the original columns.

Google Sheets and Drive updates can run automatically after each saved change
once each user connects their Google account and chooses a spreadsheet. Daylight
keeps daily totals and individual tasks in separate managed tabs and maintains a
restorable JSON backup in Drive. Follow [Google sync setup](GOOGLE_SYNC_SETUP.md)
to enable the server credentials and complete consent. This connection has not
been activated with a real Google account yet.

The calendar includes a date-based motivational quote.
The public DummyJSON quote API supplies content without receiving account or
activity data; built-in Daylight quotes remain available if that service fails.
The quote stays consistent for a selected date on the same browser.

The hydration warning containing `bis_skin_checked` and a `chrome-extension://`
script is caused by browser extension changes before React loads. See
[hydration troubleshooting](HYDRATION_TROUBLESHOOTING.md) to disable the offending
extension's site access and verify the app in a clean browser window.

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

Each day has one activity log with learning, teaching, other work, breaks and free time. Start/end times determine durations automatically. Optional weekday/weekend templates provide a starting point. Historical task records keep their statuses, notes and original times in history and backups; they no longer impose a minimum on edited activity totals.

The editor protects unsaved changes and refuses stale saves when another tab changes the day. Search activities, notes and dates in the activity list. Live totals use the same calculations as reports, and invalid/overlapping times cannot be saved. The mobile editor fits the viewport and keeps Save day visible while scrolling.

The **Learning toolkit** provides yearly learning charts, topic totals, weekly goals and a working-day streak. The **Backups** tab previews imports and downloads a safety backup before applying changes. Historical focus receipts and task records remain stored; activity edits use their own time ranges. Weekly goals remain local preferences.

**Account & sync** uses the separate Daylight Supabase project in Mumbai. The included local environment is configured; `.env.example` documents the two public variables needed elsewhere. Never use a service-role key in frontend configuration. Create an account, confirm the email, then return to the app to sign in. Supabase's email redirect allowlist must include your app URL before deployment. Sync is manual: choose **Review sync**, select which version wins when a date exists on both sides, then **Merge & sync**. Revision checks reject concurrent cloud overwrites. Signing out closes the workspace and keeps entries under that account's local key. Another account starts with its own independent entries, timer and weekly goal. Saved sessions are verified before opening the planner; an account change remounts the planner to clear previous drafts and views. Access from another device requires opening the same app there; this repository has not been published to a public URL.

### Change your sign-in email

Open **Learning toolkit > Account & sync > Change your email**, enter your new
address, and choose **Change email**. Follow the confirmation links sent to your
current and new inboxes (the required confirmations depend on the project's
Supabase email settings). Keep using the current address until confirmation is
complete, then sign in with the new address and your existing password.

The app updates your existing Supabase account. Activities, notes, cloud data,
Google connections and browser preferences stay attached to the same account
ID; no export, account deletion or data migration is needed.

### Confirmation email setup and troubleshooting

The built-in Supabase mail service is intended for testing with project team members and currently allows only two emails per hour across the project. For registration by separate users, configure **Authentication > SMTP Settings** with your email provider's host, port, username, password and verified sender address. Store SMTP credentials only in Supabase settings. Then review **Authentication > Rate Limits** for your provider's capacity and **URL Configuration** for the exact app origin. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

If signup or resend reports that confirmation emails are unavailable, check your inbox and spam folder for a previous link, or wait for the email quota to reset. Retrying repeatedly cannot restore that quota. An already confirmed account can use **Sign in** with its existing password without sending a confirmation email. If sign-in asks you to confirm your email, follow the confirmation link first; if it cannot verify your credentials, check the email and registered password. The app distinguishes these failures from request throttling and connection errors. A synchronous request guard prevents overlapping submit/resend calls; changing the email clears confirmation advice for the previous address. Clicking the selected account tab preserves the entered password.

The home screen shows all 12 months with progress bars and annual learning, miscellaneous and logged-day totals. Click a month to open a separate daily log screen; use All months to return. Browser Back/Forward and refresh preserve the selected month through the URL. Switch between Daily calendar and Activity list, search notes or dates and filter by status, jump directly to a date, or log the next pending working day up to today. Use the previous/next year arrows to browse other years; saved activity remains available across months and years. PDF and Excel downloads cover the full selected month regardless of list filters; the all-months page also offers full-year downloads.

1. Open a day, choose its type, add timed activities, optionally add notes, and save.
2. Each activity contributes its actual duration outside the fixed 13:30-14:30 lunch. Learning includes batches and free time; huddles and meetings are miscellaneous. Work excludes breaks. No miscellaneous time is invented for gaps in activity logs.
3. Calculations use integer minutes. Learning remains limited to nine hours; all logged time must fit within 24 hours.
4. Sundays default to holidays. Choose Working day to log a Sunday; any date can be marked Leave or Holiday.
5. Leave and holidays contribute zero hours while retaining their saved activities.
6. **Unlogged days remain pending** and contribute zero hours. Notes alone do not log a day. Removing every activity returns an edited day to pending.
7. The dashboard and exports share the same totals. Legacy nine-hour allocations include the lunch hour as a separate break; their original records remain stored.
8. The editor uses a native dialog with keyboard focus containment, Escape dismissal, accessible labels, and an animated panel. Reduced-motion preferences are respected.

Older entries under the unassigned daylight.activity.v1 key are preserved and never assigned automatically. In **Learning toolkit > Backups**, use **Download older device backup**, then import it into the account that owns those entries. New users do not inherit the old device log. Browser storage is not encrypted and remains accessible through developer tools on that device; cloud access is enforced by database ownership policies.

## AI Excel import

In **Learning toolkit > Backups**, choose **Import Excel with AI**, review the
extracted dates, times and categories, then select **Import activities**. A safety
backup downloads before changes are applied. Matching rows are skipped and
overlaps with saved activities reject the import without changing the workspace.
The existing standard Excel and JSON import options remain available.

Configure server-only `GROQ_API_KEY` in `.env.local` for development and as a
Secret environment variable on Vercel for production, then redeploy. The default
model is `openai/gpt-oss-120b`; `GROQ_MODEL` can override it. Requests use
[Groq's OpenAI-compatible endpoint](https://console.groq.com/docs/openai).
Never use
a `NEXT_PUBLIC_` prefix for the key or commit it. Keys exposed in chat should be
revoked and replaced.

The authenticated API sends only selected visible spreadsheet cell values to
Groq. AI selects existing cell references; the app validates dates and times,
preserves original HRS in notes, and calculates categories and lunch exclusions.
Spreadsheet text is treated as data, not instructions. No AI request writes to
the database or device log; importing requires the explicit review action.
AI supports up to 200 activities, 10 visible sheets, 500 rows and 40 columns per
sheet, with additional total size limits. Larger workbooks should be split.
Activity rows require dates and start/end times; missing statuses default to To do
with a review warning.

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
# Reminders and app assistant

Learning toolkit includes Reminders (once, daily, or monthly at a local time) and Ask Daylight. Reminders are stored per account on this browser, independently of activity logs and cloud backups. Keep the app open for timely alerts; missed reminders are shown on return. Browser notifications require permission and browser support. Monthly dates clamp to the last day of shorter months. Pause, resume, and delete are available.

Ask Daylight uses the existing server-only GROQ_API_KEY and optional GROQ_MODEL. It sends the question and a bounded selection of relevant saved logs plus complete monthly totals to Groq only on submission. Each question is independent. The assistant explains app features and searches logs; it cannot edit data or create reminders. Requests require verified sign-in, same-origin JSON, bounded input, a timeout, and one active request per user per server instance. Search samples are explicitly labeled as partial.


### Syllabus typing suggestions

Task titles and studying activity topics offer suggestions from the 100-day cybersecurity syllabus supplied in Book1.xlsx. Search by topic, lab, homework, or an exact day such as 'day 65'. Use arrow keys and Enter, or select a suggestion. Escape dismisses suggestions. Selecting a lesson changes only its title; custom text, times, status and notes remain under the user's control. Suggestions run locally without an AI request.

