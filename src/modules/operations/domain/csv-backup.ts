export type CsvColumn<Row> = Readonly<{ header: string; value: (row: Row) => unknown }>;

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  const injectionSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(injectionSafe) ? `"${injectionSafe.replace(/"/g, '""')}"` : injectionSafe;
}

export function buildCsvBackup<Row>(input: Readonly<{
  columns: readonly CsvColumn<Row>[];
  rows: readonly Row[];
  maximumRows?: number;
}>): string {
  const maximumRows = input.maximumRows ?? 100_000;
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || input.rows.length > maximumRows) {
    throw new Error("CSV_BACKUP_ROW_LIMIT");
  }
  if (input.columns.length < 1 || input.columns.length > 100) throw new Error("CSV_BACKUP_COLUMN_LIMIT");
  const headers = input.columns.map((column) => safeCell(column.header));
  const rows = input.rows.map((row) => input.columns.map((column) => safeCell(column.value(row))).join(","));
  return `\uFEFF${[headers.join(","), ...rows].join("\r\n")}\r\n`;
}
