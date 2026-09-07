import { normalizeAccountNext } from "@/modules/auth/application/normalize-internal-next";
import { parseKstDate } from "@/modules/matches/domain/match";
import { containsUnsafeText } from "@/platform/security/input-safety";

export type LegacyQuery = Readonly<Record<string, readonly string[] | undefined>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_LEGACY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function one(values: readonly string[] | undefined) {
  return values?.length === 1 ? values[0] : undefined;
}

function destination(pathname: string, entries: Readonly<Record<string, string | undefined>> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function legacyQueryFromRequest(request: Request): LegacyQuery {
  const params = new URL(request.url).searchParams;
  return Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));
}

function safeText(values: readonly string[] | undefined, maximum: number) {
  const value = one(values)?.normalize("NFKC").trim();
  return value && value.length <= maximum && !containsUnsafeText(value) ? value : undefined;
}

function positiveInteger(values: readonly string[] | undefined, maximum: number) {
  const value = one(values);
  return value && /^[1-9][0-9]{0,8}$/u.test(value) && Number(value) <= maximum ? value : undefined;
}

export function buildLegacyAppLoginDestination(query: LegacyQuery) {
  const nextValues = query.next;
  if (!nextValues || nextValues.length === 0) return "/login";
  const raw = nextValues.length === 1 ? nextValues[0] : undefined;
  return destination("/login", { next: normalizeAccountNext(raw, "/account") });
}

export function buildLegacyAppMatchesDestination(query: LegacyQuery) {
  const fromValue = one(query.from);
  const toValue = one(query.to);
  const from = fromValue && parseKstDate(fromValue) === fromValue ? fromValue : undefined;
  const to = toValue && parseKstDate(toValue) === toValue ? toValue : undefined;
  const seasonId = one(query.seasonId)?.toLocaleLowerCase("en-US");
  const winner = one(query.winner);
  const sort = one(query.sort);
  const order = one(query.order);
  return destination("/matches", {
    q: safeText(query.q, 100),
    seasonId: seasonId && UUID_PATTERN.test(seasonId) ? seasonId : undefined,
    winner: winner === "BLUE" || winner === "RED" || winner === "TIE" ? winner : undefined,
    from,
    to,
    sort: sort === "playedOn" || sort === "title" ? sort : undefined,
    order: order === "asc" || order === "desc" ? order : undefined,
    page: positiveInteger(query.page, 100),
    pageSize: positiveInteger(query.pageSize, 50),
  });
}

export function buildLegacyCanonicalIdDestination(
  basePath: string,
  id: string,
  fallback: string,
  query: Readonly<Record<string, string | undefined>> = {},
) {
  if (!basePath.startsWith("/") || basePath.includes("?") || !SAFE_LEGACY_ID.test(id)) return fallback;
  return destination(`${basePath}/${id}`, query);
}

export function buildLegacyPlayerBalanceRecommendationDestination(query: LegacyQuery) {
  const draftId = one(query.draftId)?.toLocaleLowerCase("en-US");
  const team = one(query.team);
  return destination("/tools/team-balance/drafts", {
    view: "recommendations",
    draftId: draftId && UUID_PATTERN.test(draftId) ? draftId : undefined,
    team: team === "BLUE" || team === "RED" ? team : undefined,
  });
}

export function legacyRedirectResponse(location: string) {
  if (!location.startsWith("/") || location.startsWith("//") || containsUnsafeText(location)) {
    throw new Error("Unsafe legacy redirect destination.");
  }
  return new Response(null, {
    status: 308,
    headers: {
      "Cache-Control": "no-store",
      Location: location,
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
