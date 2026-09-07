import { MMR_POSITIONS } from "../domain/mmr-projection";
import { isMmrUuid } from "./mmr-query";

type Value = string | readonly string[] | undefined;
type Params = Readonly<Record<string, Value>>;

function single(value: Value): string | undefined {
  return typeof value === "string" ? value : value?.length === 1 ? value[0] : undefined;
}

function positive(value: Value): string | undefined {
  const candidate = single(value);
  const parsed = candidate ? Number(candidate) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10_000 ? String(parsed) : undefined;
}

export function buildAdminMmrPlayersDestination(params: Params): string {
  const target = new URL("https://v2.invalid/admin/balance-ai");
  target.searchParams.set("tab", "players");
  const query = single(params.q)?.trim().normalize("NFKC").replace(/\s+/gu, " ");
  if (query && query.length <= 64 && !/[\u0000-\u001f\u007f]/u.test(query)) target.searchParams.set("q", query);
  const position = single(params.position);
  if (MMR_POSITIONS.includes(position as never)) target.searchParams.set("position", position!);
  const page = positive(params.page);
  if (page) target.searchParams.set("page", page);
  const pageSize = single(params.pageSize);
  if (pageSize && ["10", "20", "50"].includes(pageSize)) target.searchParams.set("pageSize", pageSize);
  return `${target.pathname}${target.search}`;
}

export function buildAdminMmrReviewsDestination(params: Params, reviewId?: string): string {
  const target = new URL("https://v2.invalid/admin/balance-ai");
  target.searchParams.set("tab", "reviews");
  if (reviewId && isMmrUuid(reviewId)) target.searchParams.set("review", reviewId.toLocaleLowerCase("en-US"));
  const page = positive(params.page);
  if (page) target.searchParams.set("page", page);
  const pageSize = single(params.pageSize);
  if (pageSize && ["10", "20", "50"].includes(pageSize)) target.searchParams.set("pageSize", pageSize);
  return `${target.pathname}${target.search}`;
}
