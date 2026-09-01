import { normalizePlayerQuery, type PlayerQueryValue } from "./normalize-player-query";

const PAGE_SIZE = 12;
const MAX_PAGE = 10_000;

function first(value: PlayerQueryValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

export function parsePlayerCatalogQuery(searchParams: Readonly<Record<string, PlayerQueryValue>>) {
  const parsedPage = Number.parseInt(first(searchParams.page) ?? "", 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 && parsedPage <= MAX_PAGE
    ? parsedPage
    : 1;

  return {
    query: normalizePlayerQuery(searchParams.q),
    page,
    pageSize: PAGE_SIZE,
  } as const;
}
