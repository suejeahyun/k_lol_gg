import type { TeamBalanceDraftListQuery } from "../application/ports/team-balance-repository";

export type TeamBalanceCandidateQuery =
  | Readonly<{ source: "players"; query: string }>
  | Readonly<{ source: "season"; origin: "ALL" | "SITE" | "KAKAO"; days: number }>;

function one(params: URLSearchParams, key: string) {
  const values = params.getAll(key);
  return values.length <= 1 ? values[0] ?? null : undefined;
}

function positiveInteger(value: string | null | undefined, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (value === undefined || !/^[1-9][0-9]{0,8}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function parseTeamBalanceDraftListQuery(url: string): TeamBalanceDraftListQuery | null {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== "page" && key !== "pageSize")) return null;
  const page = positiveInteger(one(params, "page"), 1, 100);
  const pageSize = positiveInteger(one(params, "pageSize"), 12, 50);
  return page === null || pageSize === null ? null : { page, pageSize };
}

export function parseTeamBalanceCandidateQuery(url: string): TeamBalanceCandidateQuery | null {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => !["source", "q", "origin", "days"].includes(key))) return null;

  const source = one(params, "source");
  const query = one(params, "q");
  const origin = one(params, "origin");
  const days = one(params, "days");
  if (source === undefined || query === undefined || origin === undefined || days === undefined) return null;

  if (source === "players") {
    if (origin !== null || days !== null || query === null) return null;
    const normalized = query.trim().normalize("NFKC").replace(/\s+/gu, " ");
    if (!normalized || normalized.length > 64 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
    return { source, query: normalized };
  }

  if (source !== "season" || query !== null) return null;
  const normalizedOrigin = origin === null ? "ALL" : origin.toLocaleUpperCase("en-US");
  if (normalizedOrigin !== "ALL" && normalizedOrigin !== "SITE" && normalizedOrigin !== "KAKAO") return null;
  const normalizedDays = positiveInteger(days, 3, 7);
  return normalizedDays === null
    ? null
    : { source, origin: normalizedOrigin, days: normalizedDays };
}
