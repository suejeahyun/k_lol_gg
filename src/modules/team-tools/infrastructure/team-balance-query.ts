import type { TeamBalanceDraftListQuery } from "../application/ports/team-balance-repository";

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
