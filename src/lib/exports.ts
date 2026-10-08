import { format } from "date-fns";
import { activityRows, monthTotals, type DayRecord } from "./activity";

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

// Export libraries load only when requested, keeping the calendar's first load small.
export async function downloadExcel(month: Date, days: DayRecord[]) {
  const XLSX = await import("xlsx");
  const rows = activityRows(days);
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(sheet, [["Daily Activity"]], { origin: "C4" });
  XLSX.utils.sheet_add_aoa(sheet, [[format(month, "MMMM yyyy")]], {
    origin: "C5",
  });
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
  const totals = monthTotals(days);
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      [
        "MONTHLY TOTALS",
        "",
        "",
        "",
        "",
        {
          t: "n",
          f: `SUM(G9:G${endRow})`,
          v: (totals.studyMinutes + totals.miscMinutes) / 60,
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
          f: `SUMIF(D9:D${endRow},"Study",G9:G${endRow})`,
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
      ["Pending working days", totals.workingDays - totals.loggedDays],
      [
        "Task rows show individual statuses. Learning hours are recorded once per day in the Study row.",
      ],
      [
        "Time blocks are allocated: Study starts at 9 AM; Miscellaneous follows until 6 PM.",
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
  XLSX.utils.book_append_sheet(workbook, sheet, format(month, "yyyy-MM"));
  XLSX.writeFile(workbook, `DAILY_ACTIVITY_${format(month, "yyyy-MM")}.xlsx`);
}

// Preserve all Unicode in Excel and the backup. The PDF uses an explicit
// ASCII fallback for scripts that require glyph coverage and shaping.
export function pdfText(text: string) {
  return text.replace(/[^\x20-\x7E\n\r\t]/g, "?");
}
export async function downloadPdf(month: Date, days: DayRecord[]) {
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
  const totals = monthTotals(days);
  doc.setFillColor(25, 60, 49);
  doc.rect(0, 0, 297, 37, "F");
  doc.setTextColor(255);
  doc.setFontSize(22);
  doc.text("Daily Activity", 14, 17);
  doc.setFontSize(10);
  doc.text(format(month, "MMMM yyyy") + "  |  9:00 AM - 6:00 PM", 14, 27);
  doc.setTextColor(36, 57, 47);
  doc.setFontSize(11);
  doc.text(
    `Learning: ${(totals.studyMinutes / 60).toFixed(2)} hr   |   Miscellaneous: ${(totals.miscMinutes / 60).toFixed(2)} hr   |   Logged: ${totals.loggedDays}/${totals.workingDays} days`,
    14,
    47,
  );
  doc.setFontSize(8);
  doc.text(
    "Hours are recorded once per day. Learning task rows show individual statuses, with no additional hours.",
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
  if (rows.some((r) => /[^\x20-\x7E\n\r\t]/.test(r.remark))) {
    doc.setPage(count);
    doc.setFontSize(7);
    doc.text(
      "Some characters are shown as ?. Excel and JSON backup preserve the original remarks.",
      14,
      207,
    );
  }
  doc.save(`DAILY_ACTIVITY_${format(month, "yyyy-MM")}.pdf`);
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

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
