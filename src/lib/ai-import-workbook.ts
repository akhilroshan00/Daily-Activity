import * as XLSX from "xlsx";

export type ImportCell = {
  address: string;
  value: string | number;
  text: string;
};
export type ImportSheet = { name: string; cells: ImportCell[] };
export type ImportWorkbook = { sheets: ImportSheet[] };
export const AI_IMPORT_LIMITS = {
  sheets: 10,
  cells: 6000,
  characters: 60000,
  rows: 500,
  columns: 40,
};

// Only cell values leave the device: never macros, links, hidden sheets or formulas.
export function readAiWorkbook(bytes: ArrayBuffer): ImportWorkbook {
  const workbook = XLSX.read(bytes, {
    type: "array",
    sheetRows: AI_IMPORT_LIMITS.rows + 1,
  });
  const sheets: ImportSheet[] = [];
  for (const name of workbook.SheetNames) {
    if (workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name)?.Hidden)
      continue;
    const sheet = workbook.Sheets[name];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!fullref"] ?? sheet["!ref"]!);
    if (
      range.e.r >= AI_IMPORT_LIMITS.rows ||
      range.e.c >= AI_IMPORT_LIMITS.columns
    )
      throw new Error(
        "For AI import, choose a sheet with at most 500 rows and 40 columns. Split larger files first.",
      );
    const cells: ImportCell[] = [];
    for (const address of Object.keys(sheet)) {
      if (address.startsWith("!")) continue;
      const cell = sheet[address] as XLSX.CellObject;
      if (cell.v === undefined || cell.v === null || cell.v === "") continue;
      if (!["s", "n", "str"].includes(cell.t)) continue;
      cells.push({
        address,
        value: typeof cell.v === "number" ? cell.v : String(cell.v),
        text: cell.w ?? String(cell.v),
      });
    }
    if (cells.length) sheets.push({ name, cells });
  }
  return validateAiWorkbook({ sheets });
}

export function validateAiWorkbook(value: unknown): ImportWorkbook {
  const workbook = value as ImportWorkbook;
  if (
    !workbook ||
    !Array.isArray(workbook.sheets) ||
    !workbook.sheets.length ||
    workbook.sheets.length > AI_IMPORT_LIMITS.sheets
  )
    throw new Error("Choose an Excel workbook with 1 to 10 visible sheets.");
  let count = 0,
    characters = 0;
  const names = new Set<string>();
  for (const sheet of workbook.sheets) {
    if (
      !sheet ||
      typeof sheet.name !== "string" ||
      !sheet.name ||
      sheet.name.length > 31 ||
      names.has(sheet.name) ||
      !Array.isArray(sheet.cells)
    )
      throw new Error("Invalid spreadsheet sheets.");
    names.add(sheet.name);
    const addresses = new Set<string>();
    for (const cell of sheet.cells) {
      if (
        !cell ||
        typeof cell.address !== "string" ||
        !/^[A-Z]{1,2}[1-9]\d{0,2}$/.test(cell.address) ||
        addresses.has(cell.address) ||
        typeof cell.text !== "string" ||
        !["string", "number"].includes(typeof cell.value) ||
        (typeof cell.value === "number" && !Number.isFinite(cell.value))
      )
        throw new Error("Invalid spreadsheet cells.");
      const position = XLSX.utils.decode_cell(cell.address);
      if (
        position.r >= AI_IMPORT_LIMITS.rows ||
        position.c >= AI_IMPORT_LIMITS.columns
      )
        throw new Error(
          "AI import supports up to 500 rows and 40 columns per sheet.",
        );
      addresses.add(cell.address);
      count++;
      characters += cell.text.length + String(cell.value).length;
    }
  }
  if (
    !count ||
    count > AI_IMPORT_LIMITS.cells ||
    characters > AI_IMPORT_LIMITS.characters
  )
    throw new Error(
      "This workbook is too large for one AI import. Split it into smaller files.",
    );
  // Do not forward any extra request properties to the model.
  return {
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      cells: sheet.cells.map(({ address, value, text }) => ({
        address,
        value,
        text,
      })),
    })),
  };
}
