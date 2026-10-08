# Daylight — Daily Activity

A complete Next.js App Router calendar for Akhil Roshan's daily learning and work activity. It uses React, TypeScript, Tailwind CSS, Framer Motion, Lucide icons, date-fns, SheetJS, jsPDF and AutoTable. All data stays in the browser's LocalStorage. No database, credentials, or environment variables are required.

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

Each day can include multiple learning tasks, with a title, optional notes and an independent status: **To do**, **In progress**, **Completed**, **Blocked** or **On hold**. Open a day, use **Add task**, then save the day. You can save planned tasks with the hours field empty; this does not count the date as a logged working day. Hours are a separate daily total. Existing entries and reflections remain available. Tasks stay attached to their day when you toggle a holiday.

The editor shows task completion progress, supports undoing the most recently removed draft task, and asks before discarding unsaved changes or clearing a day. The monthly activity list searches task titles and notes and filters by task status. PDF and Excel reports include each task and its status as a separate row with zero additional hours, so daily totals remain accurate. JSON backups include all task details.

The home screen shows all 12 months with progress bars and annual learning, miscellaneous and logged-day totals. Click a month to open a separate daily log screen; use All months to return. Browser Back/Forward and refresh preserve the selected month through the URL. Switch between Daily calendar and Activity list, search notes or dates and filter by status, jump directly to a date, or log the next pending working day up to today. Use the previous/next year arrows to browse other years; saved activity remains available across months and years. PDF and Excel downloads cover the full selected month regardless of list filters.

1. Open a day, enter learning hours from **0 to 9**, optionally add a remark, and save.
2. Each **saved working day** totals 9 hours: miscellaneous time = 9 hours minus learning time. For 4 hours learning, the app stores 240 learning minutes and 300 miscellaneous minutes.
3. Decimal hours are rounded to the nearest whole minute before calculation. For example, 4.33 hours becomes 4 hours 20 minutes. Integer minutes prevent cumulative floating-point drift.
4. Sundays default to holidays. You can override any Sunday to a working day, or mark any other day as a holiday using the small calendar button or the editor's switch.
5. Holidays contribute **0 learning and 0 miscellaneous hours**. Existing entries are retained and restored when the day becomes a working day again.
6. **Unlogged days remain pending** and contribute zero hours. Explicitly saving 0 learning hours records 9 miscellaneous hours. Future dates can be logged; a saved entry is considered completed regardless of date.
7. The dashboard and every export use the same functions for the selected month. The progress ring shows learning as a percentage of logged working hours. Days logged is compared to all working days in that month.
8. The editor uses a native dialog with keyboard focus containment, Escape dismissal, accessible labels, and an animated panel. Reduced-motion preferences are respected.

## Excel mapping to your attached workbook

The reference workbook was inspected locally. Its title is at C4 and its required header columns begin at **B8**. The export preserves this layout, with data starting at **B9**:

| Excel column | Header     | Exported content                                           |
| ------------ | ---------- | ---------------------------------------------------------- |
| B            | DATE       | Date formatted `dd/MM/yyyy`                                |
| C            | DAY        | Uppercase weekday                                          |
| D            | Activity   | Study, Miscellaneous, Holiday, or Not logged               |
| E            | START TIME | Allocated block start, e.g. 9:00 AM                        |
| F            | END TIME   | Allocated block end, e.g. 1:00 PM                          |
| G            | HRS        | Numeric duration in hours, displayed to 2 decimal places   |
| H            | STATUS     | Completed, Holiday, or Pending                             |
| I            | REMARK     | Learning/holiday note, or a miscellaneous-work description |

Learning is allocated from **9:00 AM**; miscellaneous work follows until **6:00 PM**. These are generated allocation blocks, not independently recorded start/end timestamps. A 4-hour entry exports Study 9:00 AM–1:00 PM and Miscellaneous 1:00 PM–6:00 PM. Zero-length activity rows are omitted.

Every date in the selected month appears in the report. Holiday and pending rows have blank start/end times and numeric zero duration. Recalculable SUM/SUMIF totals appear below the table. The template's unused `Column1` is omitted as requested. The export preserves the required structure and column order; it does not reproduce every original Excel cell style. The uploaded workbook's historic entries are not automatically imported or included in the app.

## PDF export

A landscape A4 report contains the same eight columns, a monthly summary, striped rows, repeating headers and page numbers. Long remarks wrap and reports may span several pages. It embeds bundled DejaVu Sans regular/bold fonts so its appearance remains consistent across PDF viewers. Text is limited to ASCII for dependable script rendering; unsupported characters are replaced with `?` and an explanatory note is added. Excel and JSON preserve multilingual remarks exactly. For a PDF with Malayalam or other scripts, add a suitable embedded font and script shaping support.

## Persistence and backup

- Activities use the versioned key `daylight.activity.v1`; theme uses `daylight.theme`.
- Existing valid data is loaded before editing is enabled. Invalid data is left intact and writes are blocked to protect it.
- Other tabs update when the browser fires a storage event. Saves read the latest persisted data before updating a day. Simultaneous edits to the same day use the last successful save.
- If storage is blocked or full, new entries stay in memory and a warning asks you to download a backup. A reload loses session-only entries.
- **Back up all data** downloads a versioned JSON backup of all months. If the stored file is corrupt, it downloads those original bytes for recovery.
- LocalStorage belongs to the particular browser, profile, and site origin. It does not sync between devices. Clearing site data removes entries; localhost, Vercel preview URLs and your production domain each have separate storage.

To restore a valid JSON backup, open your app in the browser, open Developer Tools → Console and use this one-time import. Choose your downloaded JSON when the file picker opens. This replaces all current activities; download the current backup first.

```js
const input = document.createElement("input");
input.type = "file";
input.accept = ".json";
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file) return;
  const raw = await file.text();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !data.entries || Array.isArray(data.entries)) {
    throw new Error("Unsupported backup");
  }
  if (confirm("Replace all activities with this backup?")) {
    localStorage.setItem("daylight.activity.v1", raw);
    location.reload();
  }
};
input.click();
```

The app validates each restored entry during the next load. Keep an untouched copy of your backup.

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
2. In Vercel, choose **Add New → Project**, import the repository, and select **Next.js**. If the project is nested, set Root Directory to `daily-activity`.
3. Choose Node.js **24.x** (22.x also works), leave the framework defaults, and click **Deploy**. No environment variables or Supabase project are required.

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

Choose your intended team and a new project during the CLI setup. For this deliverable, no remote project was created or deployed.

Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## Figma and Supabase

Design values are documented in `DESIGN.md` and owned by CSS tokens, so the layout can be recreated in an editable Figma file. No Figma reference file was supplied; no remote Figma file was created. Persistence follows the requested LocalStorage architecture. Supabase is unnecessary for this version; adding authenticated cross-device sync would be a separate backend change.
