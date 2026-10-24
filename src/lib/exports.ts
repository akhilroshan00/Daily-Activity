import { format } from "date-fns";
import { formatClock } from "./clock";
import {
  activityRows,
  dateKey,
  hoursLabel,
  monthTotals,
  TASK_STATUSES,
  type DayRecord,
  type Entries,
} from "./activity";
import { learningTopics } from "./time-log";
import { BACKUP_SHEET, workbookBackupRows } from "./workbook-backup";

export const HEADERS = [
  "DATE",
  "DAY",
  "Activity",
  "START TIME",
  "END TIME",
  "HRS",
  "STATUS",
  "REMARK",
];

// Shared report totals. Work is learning plus miscellaneous and excludes the
// lunch break, matching the app: a 9-6 day is 8 working hours. loggedMinutes is
// the full span including the break, which is what the HRS column sums to.
// Only working days up to today can be pending; future days are not overdue.
export function reportSummary(days: DayRecord[], today = dateKey(new Date())) {
  const totals = monthTotals(days);
  return {
    ...totals,
    workMinutes: totals.studyMinutes + totals.miscMinutes,
    loggedMinutes:
      totals.studyMinutes + totals.miscMinutes + totals.breakMinutes,
    pendingDays: days.filter(
      (day) => !day.holiday && !day.logged && day.key <= today,
    ).length,
  };
}

// Export libraries load only when requested, keeping the calendar's first load small.
export async function buildActivityWorkbook(
  month: Date,
  days: DayRecord[],
  scope: "month" | "year" = "month",
  source?: Entries,
  today = dateKey(new Date()),
) {
  const XLSX = await import("xlsx");
  const rows = activityRows(days);
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(sheet, [["Daily Activity"]], { origin: "C4" });
  XLSX.utils.sheet_add_aoa(
    sheet,
    [[format(month, scope === "year" ? "yyyy" : "MMMM yyyy")]],
    {
      origin: "C5",
    },
  );
  XLSX.utils.sheet_add_aoa(sheet, [HEADERS], { origin: "B8" });
  // Every free-text value is written as a literal string, never a spreadsheet formula.
  XLSX.utils.sheet_add_aoa(
    sheet,
    rows.map((r) => [
      r.date,
      r.day,
      r.activity,
      r.start,
      r.end,
      r.hours,
      r.status,
      r.remark,
    ]),
    { origin: "B9" },
  );
  const endRow = rows.length + 8;
  for (let row = 9; row <= endRow; row++)
    if (sheet[`G${row}`]) sheet[`G${row}`].z = '0.00" hr"';
  const summary = endRow + 3;
  const totals = reportSummary(days, today);
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      [
        scope === "year" ? "YEARLY TOTALS" : "MONTHLY TOTALS",
        "",
        "",
        "",
        "",
        {
          t: "n",
          f: `SUM(G9:G${endRow})`,
          v: totals.loggedMinutes / 60,
        },
      ],
      [
        "Learning hours",
        "",
        "",
        "",
        "",
        {
          t: "n",
          f: `SUMIF(D9:D${endRow},"Study",G9:G${endRow})+SUMIF(D9:D${endRow},"Learning task",G9:G${endRow})+SUMIF(D9:D${endRow},"Batch / teaching",G9:G${endRow})+SUMIF(D9:D${endRow},"Free time",G9:G${endRow})`,
          v: totals.studyMinutes / 60,
        },
      ],
      [
        "Miscellaneous hours",
        "",
        "",
        "",
        "",
        {
          t: "n",
          f: `SUMIF(D9:D${endRow},"Miscellaneous",G9:G${endRow})`,
          v: totals.miscMinutes / 60,
        },
      ],
      ["Logged working days", totals.loggedDays],
      ["Batch / teaching hours", totals.teachingMinutes / 60],
      ["Break / lunch hours", totals.breakMinutes / 60],
      ["Free time hours", totals.freeMinutes / 60],
      ["Work hours", totals.workMinutes / 60],
      ["Pending working days", totals.pendingDays],
      [
        "Task time plus remaining unassigned Study time reconciles to daily learning hours.",
      ],
      [
        "Lunch 1:30 PM-2:30 PM is excluded. Learning includes batches and free time; meetings and huddles are miscellaneous. Subcategories are counted once.",
      ],
    ],
    { origin: `B${summary}` },
  );
  sheet["!cols"] = [
    { wch: 3 },
    { wch: 15 },
    { wch: 16 },
    { wch: 24 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 60 },
  ];
  sheet["!autofilter"] = { ref: `B8:I${endRow}` };
  const workbook = XLSX.utils.book_new();
  const period = format(month, scope === "year" ? "yyyy" : "yyyy-MM");
  XLSX.utils.book_append_sheet(workbook, sheet, period);
  const daily = XLSX.utils.aoa_to_sheet([
    [
      "Date",
      "Day type",
      "Learning minutes",
      "Miscellaneous minutes",
      "Batch minutes",
      "Break minutes",
      "Free minutes",
      "Work minutes",
      "Logged minutes",
      "Important task",
      "Notes",
    ],
    ...days.map((day) => [
      day.key,
      day.leave
        ? "Leave"
        : day.holiday
          ? "Holiday"
          : day.logged
            ? "Working"
            : "Not logged",
      day.studyMinutes,
      day.miscMinutes,
      day.teachingMinutes ?? 0,
      day.breakMinutes ?? 0,
      day.freeMinutes ?? 0,
      day.studyMinutes + day.miscMinutes + (day.breakMinutes ?? 0),
      day.studyMinutes + day.miscMinutes + (day.breakMinutes ?? 0),
      day.importantTask ?? "",
      day.remark,
    ]),
  ]);
  daily["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    ...Array.from({ length: 7 }, () => ({ wch: 20 })),
    { wch: 40 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, daily, "Daily totals");
  const topics = XLSX.utils.aoa_to_sheet([
    ["Date", "Learning topic", "Minutes"],
    ...days
      .filter((day) => day.logged && !day.holiday)
      .flatMap((day) =>
        learningTopics({
          studyMinutes: day.studyMinutes,
          remark: day.remark,
          logged: day.logged,
          tasks: day.tasks,
          timeLog: day.timeLog,
        }).map((topic) => [day.key, topic.topic, topic.minutes]),
      ),
  ]);
  topics["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, topics, "Learning topics");
  const tasks = XLSX.utils.aoa_to_sheet([
    [
      "Date",
      "Title",
      "Status",
      "From time",
      "To time",
      "Minutes",
      "Subject",
      "Notes",
    ],
    ...days.flatMap((day) =>
      day.tasks.map((task) => [
        day.key,
        task.title,
        TASK_STATUSES[task.status] ?? task.status,
        formatClock(task.fromTime ?? ""),
        formatClock(task.toTime ?? ""),
        task.minutes ?? 0,
        task.subject ?? "",
        task.notes,
      ]),
    ),
  ]);
  tasks["!cols"] = [
    { wch: 14 },
    { wch: 40 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, tasks, "Task details");
  if (source) {
    const scoped = Object.fromEntries(
      days
        .filter((day) => source[day.key])
        .map((day) => [day.key, source[day.key]]),
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(workbookBackupRows(scoped)),
      BACKUP_SHEET,
    );
  }
  return workbook;
}
export async function downloadExcel(
  month: Date,
  days: DayRecord[],
  scope: "month" | "year" = "month",
  source?: Entries,
) {
  const [XLSX, workbook] = await Promise.all([
    import("xlsx"),
    buildActivityWorkbook(month, days, scope, source),
  ]);
  // Build the file in memory and download it ourselves. XLSX.writeFile relies
  // on its own anchor-click, which some browsers silently block so no file
  // ever appears; a Blob download is the same path the JSON backup uses.
  const data = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
  downloadBlob(
    new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `DAILY_ACTIVITY_${format(month, scope === "year" ? "yyyy" : "yyyy-MM")}.xlsx`,
  );
}

// Preserve all Unicode in Excel and the backup. The PDF keeps Latin, Greek,
// Cyrillic and common punctuation (all covered by DejaVu Sans) and falls back
// to ? for scripts that need glyph coverage or shaping the font lacks.
const PDF_UNSUPPORTED = /[^\x20-\x7E\n\r\t -ɏͰ-ϿЀ-ӿ‐-‧€™]/g;
export function pdfText(text: string) {
  return text.replace(PDF_UNSUPPORTED, "?");
}
export async function downloadPdf(
  month: Date,
  days: DayRecord[],
  scope: "month" | "year" = "month",
  today = dateKey(new Date()),
) {
  const [{ jsPDF }, { default: autoTable }, regularFont, boldFont] =
    await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
      loadPdfFont("DejaVuSans.ttf"),
      loadPdfFont("DejaVuSans-Bold.ttf"),
    ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", regularFont);
  doc.addFont("DejaVuSans.ttf", "ReportSans", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", boldFont);
  doc.addFont("DejaVuSans-Bold.ttf", "ReportSans", "bold");
  doc.setFont("ReportSans", "normal");
  const totals = reportSummary(days, today);
  doc.setFillColor(25, 60, 49);
  doc.rect(0, 0, 297, 37, "F");
  doc.setTextColor(255);
  doc.setFontSize(22);
  doc.text("Daily Activity", 14, 17);
  doc.setFontSize(10);
  doc.text(
    format(month, scope === "year" ? "yyyy" : "MMMM yyyy") +
      "  |  9:00 AM - 6:00 PM",
    14,
    27,
  );
  doc.setTextColor(36, 57, 47);
  doc.setFontSize(11);
  doc.text(
    `Learning: ${(totals.studyMinutes / 60).toFixed(2)} hr   |   Miscellaneous: ${(totals.miscMinutes / 60).toFixed(2)} hr   |   Logged: ${totals.loggedDays}/${totals.workingDays} days   |   Pending: ${totals.pendingDays} days`,
    14,
    47,
  );
  doc.setFontSize(8);
  doc.text(
    `Batch: ${hoursLabel(totals.teachingMinutes)} hr | Breaks: ${hoursLabel(totals.breakMinutes)} hr | Free: ${hoursLabel(totals.freeMinutes)} hr | Work: ${hoursLabel(totals.workMinutes)} hr`,
    14,
    51,
  );
  doc.setFontSize(8);
  doc.text(
    "Task time and remaining Study time reconcile to daily learning totals. Pending days and holidays contribute zero hours.",
    14,
    54,
  );
  const rows = activityRows(days);
  autoTable(doc, {
    startY: 61,
    head: [HEADERS],
    body: rows.map((r) => [
      r.date,
      r.day,
      r.activity,
      r.start,
      r.end,
      r.hours.toFixed(2),
      r.status,
      pdfText(r.remark),
    ]),
    theme: "striped",
    margin: { left: 14, right: 14, bottom: 17 },
    styles: {
      font: "ReportSans",
      fontSize: 8,
      cellPadding: 2.8,
      overflow: "linebreak",
      textColor: [44, 59, 50],
    },
    headStyles: { fillColor: [25, 60, 49], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [242, 247, 244] },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 28 },
      2: { cellWidth: 29 },
      3: { cellWidth: 23 },
      4: { cellWidth: 23 },
      5: { cellWidth: 17 },
      6: { cellWidth: 25 },
      7: { cellWidth: "auto" },
    },
    rowPageBreak: "avoid",
  });
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    doc.setFont("ReportSans", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Daylight / Daily Activity", 14, 202);
    doc.text(`${page} / ${count}`, 283, 202, { align: "right" });
  }
  if (rows.some((r) => pdfText(r.remark) !== r.remark)) {
    doc.setPage(count);
    doc.setFontSize(7);
    doc.text(
      "Some characters are shown as ?. Excel and JSON backup preserve the original remarks.",
      14,
      207,
    );
  }
  downloadBlob(
    doc.output("blob"),
    `DAILY_ACTIVITY_${format(month, scope === "year" ? "yyyy" : "yyyy-MM")}.pdf`,
  );
}

async function loadPdfFont(name: string): Promise<string> {
  const response = await fetch(`/fonts/${name}`);
  if (!response.ok) throw new Error("The PDF font could not be loaded.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

// Every download goes through one anchor-click on an object URL. This is the
// most widely supported path and the only one not silently blocked when a
// library tries to trigger the download from inside its own module scope.
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, type = "application/json") {
  downloadBlob(new Blob([text], { type }), name);
}
