import {
  isSeasonKakaoPendingMatchState,
  isSeasonKakaoPendingStatus,
  SeasonServiceError,
} from "../domain/season";
import type { AdminKakaoPendingQuery } from "../application/ports/season-repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const positiveIntegerPattern = /^[1-9][0-9]*$/;
const unsafeTextPattern = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const allowedKeys = new Set(["seasonId", "applyDate", "recruitNo", "matchState", "status", "q", "page", "limit"]);

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

function positiveInteger(value: string | undefined, fallback: number, maximum: number, label: string) {
  if (!value) return fallback;
  if (!positiveIntegerPattern.test(value)) throw new SeasonServiceError("INVALID_INPUT", `${label} 값을 확인해 주세요.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new SeasonServiceError("INVALID_INPUT", `${label} 값을 확인해 주세요.`);
  }
  return parsed;
}

export function parseAdminKakaoPendingQuery(url: string): AdminKakaoPendingQuery {
  const search = new URL(url).searchParams;
  for (const key of search.keys()) {
    if (!allowedKeys.has(key)) throw new SeasonServiceError("INVALID_INPUT", "허용되지 않은 조회 조건입니다.");
  }
  const seasonId = single(search, "seasonId");
  const applyDate = single(search, "applyDate");
  const matchState = single(search, "matchState");
  const status = single(search, "status");
  const rawQuery = single(search, "q");
  if (seasonId && !uuidPattern.test(seasonId)) throw new SeasonServiceError("INVALID_INPUT", "시즌 식별자를 확인해 주세요.");
  const [year, month, day] = (applyDate ?? "0-0-0").split("-").map(Number);
  const dateProbe = new Date(Date.UTC(year, month - 1, day));
  if (applyDate && (!datePattern.test(applyDate) || dateProbe.getUTCFullYear() !== year || dateProbe.getUTCMonth() !== month - 1 || dateProbe.getUTCDate() !== day)) {
    throw new SeasonServiceError("INVALID_INPUT", "신청 날짜를 확인해 주세요.");
  }
  if (matchState && !isSeasonKakaoPendingMatchState(matchState)) throw new SeasonServiceError("INVALID_INPUT", "일치 상태를 확인해 주세요.");
  if (status && !isSeasonKakaoPendingStatus(status)) throw new SeasonServiceError("INVALID_INPUT", "처리 상태를 확인해 주세요.");
  const query = rawQuery?.normalize("NFKC").replace(/\s+/g, " ");
  if (query && query.length > 80) throw new SeasonServiceError("INVALID_INPUT", "검색어는 80자까지 입력해 주세요.");
  const recruitNoText = single(search, "recruitNo");
  const recruitNo = recruitNoText ? positiveInteger(recruitNoText, 1, 999, "모집 회차") : undefined;
  return {
    page: positiveInteger(single(search, "page"), 1, 100_000, "페이지"),
    pageSize: positiveInteger(single(search, "limit"), 20, 50, "페이지 크기"),
    ...(seasonId ? { seasonId } : {}),
    ...(applyDate ? { applyDate } : {}),
    ...(recruitNo ? { recruitNo } : {}),
    ...(matchState && isSeasonKakaoPendingMatchState(matchState) ? { matchState } : {}),
    ...(status && isSeasonKakaoPendingStatus(status) ? { status } : {}),
    ...(query ? { query } : {}),
  };
}

export function parseCandidateQuery(url: string): string {
  const search = new URL(url).searchParams;
  for (const key of search.keys()) if (key !== "q") throw new SeasonServiceError("INVALID_INPUT", "허용되지 않은 조회 조건입니다.");
  const query = single(search, "q")?.normalize("NFKC").replace(/\s+/g, " ") ?? "";
  if (query.length > 80) throw new SeasonServiceError("INVALID_INPUT", "검색어는 80자까지 입력해 주세요.");
  return query;
}
