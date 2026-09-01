import { isSeasonApplicationStatus, SeasonServiceError } from "../domain/season";
import type { AdminWorkspaceQuery } from "../application/ports/season-repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveIntegerPattern = /^[1-9][0-9]*$/;
const unsafeTextPattern = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const allowedKeys = new Set(["seasonId", "status", "source", "q", "page", "limit"]);

function single(search: URLSearchParams, key: string): string | undefined {
  const values = search.getAll(key);
  if (values.length > 1) throw new SeasonServiceError("INVALID_INPUT", "조회 조건이 중복되었습니다.");
  const value = values[0];
  if (value === undefined || value === "") return undefined;
  if (value !== value.trim() || unsafeTextPattern.test(value)) {
    throw new SeasonServiceError("INVALID_INPUT", "조회 조건 형식을 확인해 주세요.");
  }
  return value;
}

export function parseAdminSeasonQuery(url: string): AdminWorkspaceQuery {
  const search = new URL(url).searchParams;
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) throw new SeasonServiceError("INVALID_INPUT", "허용되지 않은 조회 조건입니다.");
  }
  const pageText = single(search, "page");
  const pageSizeText = single(search, "limit");
  const statusText = single(search, "status");
  const sourceText = single(search, "source");
  const seasonId = single(search, "seasonId");
  const query = single(search, "q");
  if (pageText && !positiveIntegerPattern.test(pageText)) {
    throw new SeasonServiceError("INVALID_INPUT", "페이지 값을 확인해 주세요.");
  }
  if (pageSizeText && !positiveIntegerPattern.test(pageSizeText)) {
    throw new SeasonServiceError("INVALID_INPUT", "페이지 크기를 확인해 주세요.");
  }
  const page = pageText ? Number(pageText) : 1;
  const pageSize = pageSizeText ? Number(pageSizeText) : 20;
  if (!Number.isInteger(page) || page < 1 || page > 100_000) {
    throw new SeasonServiceError("INVALID_INPUT", "페이지 값을 확인해 주세요.");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new SeasonServiceError("INVALID_INPUT", "페이지 크기를 확인해 주세요.");
  }
  if (statusText && !isSeasonApplicationStatus(statusText)) {
    throw new SeasonServiceError("INVALID_INPUT", "신청 상태 필터를 확인해 주세요.");
  }
  if (sourceText && sourceText !== "SITE" && sourceText !== "KAKAO") {
    throw new SeasonServiceError("INVALID_INPUT", "신청 출처 필터를 확인해 주세요.");
  }
  if (seasonId && !uuidPattern.test(seasonId)) {
    throw new SeasonServiceError("INVALID_INPUT", "시즌 식별자를 확인해 주세요.");
  }
  const normalizedQuery = query?.normalize("NFKC").replace(/\s+/g, " ");
  if (normalizedQuery && normalizedQuery.length > 80) {
    throw new SeasonServiceError("INVALID_INPUT", "검색어는 80자까지 입력해 주세요.");
  }
  return {
    page,
    pageSize,
    ...(statusText && isSeasonApplicationStatus(statusText) ? { status: statusText } : {}),
    ...(sourceText === "SITE" || sourceText === "KAKAO" ? { source: sourceText } : {}),
    ...(seasonId ? { seasonId } : {}),
    ...(normalizedQuery ? { query: normalizedQuery } : {}),
  };
}
