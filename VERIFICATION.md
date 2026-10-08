# Verification

Verified on 8 October 2026 against the production Next.js build.

| Check | Result |
| --- | --- |
| `npm run build` | Passed; App Router pages prerender successfully |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | All 10 tests passed |
| Native daily editor | Blank input rejected; 4-hour study entry saved |
| Daily/month totals | 4 study + 5 miscellaneous hours; matching dashboard and downloads |
| Reload persistence | Entry retained after page reload |
| Holidays | Custom holiday excludes hours; reversing it restores the entry |
| Sunday override | Sunday can be a working day; 0 study records 9 miscellaneous hours |
| Keyboard | Escape closes the editor and focus returns to the triggering date |
| Theme | Dark-mode choice retained after reload |
| Monthly report | 31 rows for October 2026; editable day controls present |
| Browser Excel download | Eight required columns verified in B8:I8; numeric 4/5 durations and correct time blocks |
| Browser PDF download | Landscape PDF generated with correct 4/5 totals; embedded font output visually inspected |
| Mobile widths | 390 px and 320 px; no document-level horizontal overflow |
| Browser errors | No page or console errors during the tested flow |

Browser verification used headless Chromium against `next start`. Desktop/mobile/editor screenshots were inspected. A separate export case checked a 500-character remark and a multi-page PDF. This validates the listed flow; it is not an exhaustive compatibility test across all browsers. The project has not been deployed to a remote Vercel project.
