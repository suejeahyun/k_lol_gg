import { NextResponse } from "next/server";

type CsvPrimitive = string | number | boolean | Date | null | undefined;
type CsvRowObject = Record<string, CsvPrimitive>;
type CsvRowArray = CsvPrimitive[];

function escapeCsvCell(value: unknown) {
  const raw = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);

  // Excel / Google Sheets formula injection 방어
  const safe = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;

  const escaped = safe.replaceAll('"', '""');

  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function toCsv(rows: CsvRowObject[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);

  const headerLine = headers.map(escapeCsvCell).join(",");

  const bodyLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header])).join(",")
  );

  return [headerLine, ...bodyLines].join("\n");
}

export function toCsvWithHeaders(headers: string[], rows: CsvRowArray[]) {
  const headerLine = headers.map(escapeCsvCell).join(",");

  const bodyLines = rows.map((row) =>
    headers.map((_, index) => escapeCsvCell(row[index])).join(",")
  );

  return [headerLine, ...bodyLines].join("\n");
}

export function createCsvStreamResponse(
  filename: string,
  headers: string[],
  rows: AsyncIterable<CsvRowArray>,
) {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.asyncIterator]();
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`\uFEFF${headers.map(escapeCsvCell).join(",")}\n`),
        );

        let lines: string[] = [];
        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          lines.push(
            headers
              .map((_, index) => escapeCsvCell(next.value[index]))
              .join(","),
          );

          if (lines.length >= 100) {
            controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
            lines = [];
          }
        }

        if (lines.length > 0) {
          controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export function createCsvResponse(
  rows: CsvRowObject[],
  filename: string
): NextResponse;

export function createCsvResponse(
  filename: string,
  headers: string[],
  rows: CsvRowArray[]
): NextResponse;

export function createCsvResponse(
  arg1: CsvRowObject[] | string,
  arg2: string | string[],
  arg3?: CsvRowArray[]
) {
  let csv = "";
  let filename = "";

  // 기존 방식 1:
  // createCsvResponse(rows, filename)
  if (Array.isArray(arg1) && typeof arg2 === "string") {
    csv = toCsv(arg1);
    filename = arg2;
  }

  // 기존 방식 2:
  // createCsvResponse(filename, headers, rows)
  else if (typeof arg1 === "string" && Array.isArray(arg2) && Array.isArray(arg3)) {
    csv = toCsvWithHeaders(arg2, arg3);
    filename = arg1;
  }

  else {
    throw new Error("createCsvResponse 인자 형식이 올바르지 않습니다.");
  }

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
