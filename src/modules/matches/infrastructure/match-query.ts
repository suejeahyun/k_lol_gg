import { createHash } from "node:crypto";

import {
  MATCH_SERIES_STATUSES,
  MATCH_SUBMISSION_STATUSES,
  parseKstDate,
} from "../domain/match";
import type {
  AdminMatchQuery,
  OwnSubmissionQuery,
  PublicMatchQuery,
} from "../application/ports/match-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function exactSingleParams(params: URLSearchParams, allowed: ReadonlySet<string>) {
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return false;
  }
  return true;
}

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (!/^[1-9][0-9]{0,8}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function queryText(value: string | null) {
  if (value === null || value === "") return undefined;
  const normalized = value.normalize("NFKC").trim();
  return normalized.length >= 1 && normalized.length <= 100 && !CONTROL_OR_BIDI_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function parseAdminPlayerOptionQuery(url: string): Readonly<{
  query: string;
  includePlayerIds: readonly string[];
}> | null {
  const params = new URL(url).searchParams;
  if (!exactSingleParams(params, new Set(["q", "include"]))) return null;
  const query = queryText(params.get("q"));
  const includeRaw = params.get("include");
  const includePlayerIds = includeRaw === null || includeRaw === ""
    ? []
    : includeRaw.split(",").map((id) => id.toLocaleLowerCase("en-US"));
  if (
    !query ||
    query.length < 2 ||
    query.length > 64 ||
    includePlayerIds.length > 10 ||
    new Set(includePlayerIds).size !== includePlayerIds.length ||
    includePlayerIds.some((id) => !UUID_PATTERN.test(id))
  ) return null;
  return { query, includePlayerIds };
}

type Cursor = NonNullable<PublicMatchQuery["cursor"]>;

type PublicFilterFingerprintInput = Pick<
  PublicMatchQuery,
  "query" | "seasonId" | "winner" | "from" | "to" | "sort" | "order" | "pageSize"
>;

export function publicMatchFilterFingerprint(input: PublicFilterFingerprintInput) {
  const canonical = JSON.stringify({
    from: input.from ?? null,
    order: input.order,
    pageSize: input.pageSize,
    query: input.query ?? null,
    seasonId: input.seasonId ?? null,
    sort: input.sort,
    to: input.to ?? null,
    winner: input.winner ?? null,
  });
  return createHash("sha256").update(`klol-v2:public-match-cursor:v1\0${canonical}`, "utf8").digest("hex");
}

function cursorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function encodePublicMatchCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePublicMatchCursor(value: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]{20,500}$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursorRecord(parsed)) return null;
    const keys = Object.keys(parsed).sort();
    if (
      parsed.sort === "playedOn" &&
      (parsed.order === "asc" || parsed.order === "desc") &&
      typeof parsed.playedOn === "string" &&
      parseKstDate(parsed.playedOn) === parsed.playedOn &&
      (parsed.startedAt === null ||
        (typeof parsed.startedAt === "string" && Number.isFinite(new Date(parsed.startedAt).getTime()))) &&
      typeof parsed.id === "string" &&
      UUID_PATTERN.test(parsed.id) &&
      typeof parsed.filterFingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(parsed.filterFingerprint) &&
      keys.join(",") === "filterFingerprint,id,order,playedOn,sort,startedAt"
    ) {
      return { ...parsed, id: parsed.id.toLocaleLowerCase("en-US") } as Cursor;
    }
    if (
      parsed.sort === "title" &&
      (parsed.order === "asc" || parsed.order === "desc") &&
      typeof parsed.titleNormalized === "string" &&
      parsed.titleNormalized.length >= 1 &&
      parsed.titleNormalized.length <= 160 &&
      !CONTROL_OR_BIDI_PATTERN.test(parsed.titleNormalized) &&
      typeof parsed.id === "string" &&
      UUID_PATTERN.test(parsed.id) &&
      typeof parsed.filterFingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(parsed.filterFingerprint) &&
      keys.join(",") === "filterFingerprint,id,order,sort,titleNormalized"
    ) {
      return { ...parsed, id: parsed.id.toLocaleLowerCase("en-US") } as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}

export function parsePublicMatchQuery(url: string): PublicMatchQuery | null {
  const params = new URL(url).searchParams;
  if (!exactSingleParams(params, new Set(["q", "seasonId", "winner", "from", "to", "sort", "order", "cursor", "page", "pageSize"]))) {
    return null;
  }
  const query = queryText(params.get("q"));
  const seasonIdRaw = params.get("seasonId") || undefined;
  const seasonId = seasonIdRaw?.toLocaleLowerCase("en-US");
  const winnerValue = params.get("winner");
  const winner = winnerValue === "BLUE" || winnerValue === "RED" || winnerValue === "TIE"
    ? winnerValue
    : undefined;
  const fromValue = params.get("from");
  const toValue = params.get("to");
  const from = fromValue === null ? undefined : parseKstDate(fromValue);
  const to = toValue === null ? undefined : parseKstDate(toValue);
  const sortValue = params.get("sort");
  const orderValue = params.get("order");
  const page = positiveInteger(params.get("page"), 1, 100);
  const pageSize = positiveInteger(params.get("pageSize"), 12, 50);
  const cursorValue = params.get("cursor");
  const cursor = cursorValue === null ? undefined : decodePublicMatchCursor(cursorValue);
  const resolvedSort = sortValue === "title" ? "title" : "playedOn";
  const resolvedOrder = orderValue === "asc" ? "asc" : "desc";
  const expectedFingerprint = pageSize === null
    ? null
    : publicMatchFilterFingerprint({
        ...(query ? { query } : {}),
        ...(seasonId ? { seasonId } : {}),
        ...(winner ? { winner } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        sort: resolvedSort,
        order: resolvedOrder,
        pageSize,
      });
  if (
    query === null ||
    (seasonIdRaw !== undefined && !UUID_PATTERN.test(seasonIdRaw)) ||
    (winnerValue !== null && !winner) ||
    (fromValue !== null && !from) ||
    (toValue !== null && !to) ||
    (from && to && from > to) ||
    (sortValue !== null && sortValue !== "playedOn" && sortValue !== "title") ||
    (orderValue !== null && orderValue !== "asc" && orderValue !== "desc") ||
    page === null ||
    pageSize === null ||
    (cursorValue !== null && !cursor) ||
    (cursor != null && page !== 1) ||
    (cursor != null && (cursor.sort !== resolvedSort || cursor.order !== resolvedOrder || cursor.filterFingerprint !== expectedFingerprint))
  ) {
    return null;
  }
  return {
    ...(query ? { query } : {}),
    ...(seasonId ? { seasonId } : {}),
    ...(winner ? { winner } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    sort: resolvedSort,
    order: resolvedOrder,
    ...(cursor ? { cursor } : {}),
    page,
    pageSize,
  };
}

export function parseAdminMatchQuery(url: string): AdminMatchQuery | null {
  const params = new URL(url).searchParams;
  if (!exactSingleParams(params, new Set(["view", "q", "season", "matchStatus", "submissionStatus", "page", "pageSize"]))) {
    return null;
  }
  const viewValue = params.get("view");
  const query = queryText(params.get("q"));
  const seasonRaw = params.get("season") || undefined;
  const seasonValue =
    seasonRaw === "UNASSIGNED" ? seasonRaw : seasonRaw?.toLocaleLowerCase("en-US");
  const matchStatusValue = params.get("matchStatus");
  const submissionStatusValue = params.get("submissionStatus");
  const page = positiveInteger(params.get("page"), 1, 100);
  const pageSize = positiveInteger(params.get("pageSize"), 20, 50);
  const matchStatus = MATCH_SERIES_STATUSES.find((value) => value === matchStatusValue);
  const submissionStatus = MATCH_SUBMISSION_STATUSES.find((value) => value === submissionStatusValue);
  const resolvedView = viewValue === "submissions" ? "submissions" : "matches";
  if (
    (viewValue !== null && viewValue !== "matches" && viewValue !== "submissions") ||
    query === null ||
    (seasonRaw !== undefined && seasonRaw !== "UNASSIGNED" && !UUID_PATTERN.test(seasonRaw)) ||
    (matchStatusValue !== null && !matchStatus) ||
    (submissionStatusValue !== null && !submissionStatus) ||
    (resolvedView === "matches" && submissionStatusValue !== null) ||
    (resolvedView === "submissions" && matchStatusValue !== null) ||
    page === null ||
    pageSize === null
  ) {
    return null;
  }
  return {
    view: resolvedView,
    ...(query ? { query } : {}),
    ...(seasonValue ? { season: seasonValue } : {}),
    ...(matchStatus ? { matchStatus } : {}),
    ...(submissionStatus ? { submissionStatus } : {}),
    page,
    pageSize,
  };
}

type OwnCursorPayload = Readonly<{
  updatedAt: string;
  id: string;
  status: (typeof MATCH_SUBMISSION_STATUSES)[number] | null;
}>;

export function encodeOwnSubmissionCursor(payload: OwnCursorPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeOwnSubmissionCursor(value: string): OwnCursorPayload | null {
  if (!/^[A-Za-z0-9_-]{20,500}$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursorRecord(parsed) || Object.keys(parsed).sort().join(",") !== "id,status,updatedAt") {
      return null;
    }
    if (
      typeof parsed.id !== "string" ||
      !UUID_PATTERN.test(parsed.id) ||
      typeof parsed.updatedAt !== "string" ||
      !Number.isFinite(new Date(parsed.updatedAt).getTime()) ||
      !(
        parsed.status === null ||
        MATCH_SUBMISSION_STATUSES.some((status) => status === parsed.status)
      )
    ) {
      return null;
    }
    return {
      id: parsed.id.toLocaleLowerCase("en-US"),
      updatedAt: new Date(parsed.updatedAt).toISOString(),
      status: parsed.status as OwnCursorPayload["status"],
    };
  } catch {
    return null;
  }
}

export function parseOwnSubmissionQuery(url: string): OwnSubmissionQuery | null {
  const params = new URL(url).searchParams;
  if (!exactSingleParams(params, new Set(["status", "cursor", "pageSize"]))) return null;
  const statusValue = params.get("status");
  const status = MATCH_SUBMISSION_STATUSES.find((candidate) => candidate === statusValue);
  const pageSize = positiveInteger(params.get("pageSize"), 20, 50);
  const cursorValue = params.get("cursor");
  const cursorPayload = cursorValue === null ? undefined : decodeOwnSubmissionCursor(cursorValue);
  if (
    (statusValue !== null && !status) ||
    pageSize === null ||
    (cursorValue !== null && !cursorPayload) ||
    (cursorPayload && cursorPayload.status !== (status ?? null))
  ) {
    return null;
  }
  return {
    ...(status ? { status } : {}),
    ...(cursorPayload
      ? { cursor: { id: cursorPayload.id, updatedAt: cursorPayload.updatedAt } }
      : {}),
    pageSize,
  };
}
