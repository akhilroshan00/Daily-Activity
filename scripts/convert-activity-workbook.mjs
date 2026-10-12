import fs from "node:fs";
import path from "node:path";
import { parseActivityWorkbook } from "../src/lib/activity-import.ts";
import { encodeEntries } from "../src/lib/activity.ts";

const input = process.argv[2];
if (!input) throw new Error("Provide an activity workbook path.");
const dateCorrections = Object.fromEntries(
  process.argv.slice(3).map((value) => {
    const match =
      /^--correct-date=(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(value);
    if (!match) throw new Error(`Unknown option: ${value}`);
    return [match[1], match[2]];
  }),
);
const result = parseActivityWorkbook(fs.readFileSync(input), {
  dateCorrections,
});
const directory = path.resolve("local-imports");
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(
  path.join(directory, "DAILY_ACTIVITY_IMPORT.json"),
  encodeEntries(result.entries),
);
fs.writeFileSync(
  path.join(directory, "import-review.json"),
  JSON.stringify(result.warnings, null, 2),
);
console.log(
  JSON.stringify({
    days: Object.keys(result.entries).length,
    tasks: Object.values(result.entries).reduce(
      (sum, day) => sum + day.tasks.length,
      0,
    ),
    minutes: Object.values(result.entries).reduce(
      (sum, day) => sum + day.studyMinutes,
      0,
    ),
    warnings: result.warnings,
  }),
);
