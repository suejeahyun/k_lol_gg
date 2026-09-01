import { PLAYER_STATUSES, type AdminPlayerListQuery } from "../domain/admin-player";

export type AdminPlayerQueryResult =
  | Readonly<{ ok: true; value: AdminPlayerListQuery }>
  | Readonly<{ ok: false }>;

function one(params: URLSearchParams, key: string): string | null | "duplicate" {
  const values = params.getAll(key);
  if (values.length > 1) return "duplicate";
  return values[0] ?? null;
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^[1-9][0-9]{0,4}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed <= maximum ? parsed : null;
}

export function parseAdminPlayerQuery(params: URLSearchParams): AdminPlayerQueryResult {
  const allowed = new Set(["q", "status", "page", "pageSize"]);
  if ([...params.keys()].some((key) => !allowed.has(key))) return { ok: false };

  const rawQuery = one(params, "q");
  const rawStatus = one(params, "status");
  const rawPage = one(params, "page");
  const rawPageSize = one(params, "pageSize");
  if ([rawQuery, rawStatus, rawPage, rawPageSize].includes("duplicate")) return { ok: false };

  const query = (rawQuery ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (query.length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(query)) return { ok: false };

  const status = (rawStatus ?? "ALL").toUpperCase();
  if (status !== "ALL" && !PLAYER_STATUSES.includes(status as never)) return { ok: false };

  const page = positiveInteger(rawPage, 1, 10_000);
  const pageSize = positiveInteger(rawPageSize, 20, 50);
  if (page === null || pageSize === null) return { ok: false };

  return {
    ok: true,
    value: {
      query,
      status: status as AdminPlayerListQuery["status"],
      page,
      pageSize,
    },
  };
}
