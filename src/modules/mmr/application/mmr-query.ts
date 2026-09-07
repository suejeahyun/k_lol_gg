import { MMR_POSITIONS, type MmrPosition } from "../domain/mmr-projection";
import type { MmrPlayerQuery } from "./ports/mmr-repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function single(search: URLSearchParams, key: string): string | null | undefined {
  const values = search.getAll(key);
  return values.length > 1 ? undefined : values[0] ?? null;
}

export function isMmrUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function parseMmrPlayerQuery(url: string): MmrPlayerQuery | null {
  const search = new URL(url).searchParams;
  if ([...search.keys()].some((key) => !["q", "position", "page", "pageSize"].includes(key))) return null;
  const rawQuery = single(search, "q");
  const rawPosition = single(search, "position");
  const rawPage = single(search, "page");
  const rawPageSize = single(search, "pageSize");
  if ([rawQuery, rawPosition, rawPage, rawPageSize].includes(undefined)) return null;
  const query = (rawQuery ?? "").trim().normalize("NFKC").replace(/\s+/gu, " ");
  if (query.length > 64 || /[\u0000-\u001f\u007f]/u.test(query)) return null;
  const position = rawPosition === null || rawPosition === ""
    ? null
    : MMR_POSITIONS.includes(rawPosition as MmrPosition)
      ? rawPosition as MmrPosition
      : undefined;
  if (position === undefined) return null;
  const page = rawPage === null ? 1 : Number(rawPage);
  const pageSize = rawPageSize === null ? 20 : Number(rawPageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000 || ![10, 20, 50].includes(pageSize)) return null;
  return { query, position, page, pageSize };
}

export function parseMmrReviewQuery(url: string): Readonly<{ page: number; pageSize: number }> | null {
  const search = new URL(url).searchParams;
  if ([...search.keys()].some((key) => !["page", "pageSize"].includes(key))) return null;
  const rawPage = single(search, "page");
  const rawPageSize = single(search, "pageSize");
  if (rawPage === undefined || rawPageSize === undefined) return null;
  const page = rawPage === null ? 1 : Number(rawPage);
  const pageSize = rawPageSize === null ? 20 : Number(rawPageSize);
  return Number.isSafeInteger(page) && page >= 1 && page <= 10_000 && [10, 20, 50].includes(pageSize)
    ? { page, pageSize }
    : null;
}
