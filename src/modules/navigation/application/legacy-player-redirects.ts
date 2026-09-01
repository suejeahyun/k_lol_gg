import { normalizePlayerQuery, type PlayerQueryValue } from "@/modules/players/application/normalize-player-query";

type LegacySearchParams = Readonly<Record<string, PlayerQueryValue>>;

const MAX_PAGE = 10_000;

function first(value: PlayerQueryValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function normalizePage(value: PlayerQueryValue): string | null {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isInteger(parsed) && parsed > 1 && parsed <= MAX_PAGE ? String(parsed) : null;
}

export function buildLegacyHomeDestination(searchParams: LegacySearchParams): string {
  return first(searchParams.source) === "pwa" ? "/?source=pwa" : "/";
}

export function buildLegacyPlayersDestination(searchParams: LegacySearchParams): string {
  const destination = new URL("https://v2.invalid/players");
  const query = normalizePlayerQuery(searchParams.q);
  const page = normalizePage(searchParams.page);

  if (query) destination.searchParams.set("q", query);
  if (page) destination.searchParams.set("page", page);

  return `${destination.pathname}${destination.search}`;
}
