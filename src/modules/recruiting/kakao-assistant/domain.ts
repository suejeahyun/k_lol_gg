import { createHash } from "node:crypto";

import type { PlayerSummary } from "@/modules/players/domain/player";

export type KakaoPlayerSearchItemDto = Readonly<{
  playerId: string;
  displayName: string;
  riotId: string;
  mainPosition: PlayerSummary["mainPosition"];
  tier: string | null;
}>;

export type KakaoPlayerSearchDto = Readonly<{
  kind: "PLAYER_SEARCH";
  query: string;
  items: readonly KakaoPlayerSearchItemDto[];
  totalCount: number;
  truncated: boolean;
}>;

export type KakaoOpenChatStatusDto = Readonly<{
  kind: "OPENCHAT_STATUS";
  parties: readonly Readonly<{
    id: string;
    recruitDate: string;
    recruitNumber: number;
    title: string;
    status: "IN_PROGRESS";
    memberCount: number;
    maximumMembers: number;
    scheduledStartAt: string | null;
  }>[];
  scrims: readonly Readonly<{
    id: string;
    recruitDate: string;
    scrimNumber: number;
    status: "RECRUITING" | "MATCHED" | "CONFIRMED";
    bestOf: number;
    scheduledAt: string | null;
  }>[];
}>;

export type KakaoScheduledNoticeDto = Readonly<{
  kind: "SCHEDULED_NOTICE";
  slot: string | null;
  seasonId: string | null;
  date: string;
  targetCount: 10;
  total: number;
  remaining: number;
  positionCounts: Readonly<{ TOP: number; JGL: number; MID: number; ADC: number; SUP: number }>;
  shortagePositions: readonly ("TOP" | "JGL" | "MID" | "ADC" | "SUP")[];
}>;

export type KakaoAssistantResponse = KakaoPlayerSearchDto | KakaoOpenChatStatusDto | KakaoScheduledNoticeDto;

export class KakaoAssistantError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "IDEMPOTENCY_MISMATCH" | "NONCE_CONFLICT" | "INCOMPLETE_RECEIPT") {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseKakaoPlayerQuery(value: unknown) {
  if (typeof value !== "string") throw new KakaoAssistantError("INVALID_INPUT");
  const query = value.normalize("NFKC").trim().replace(/^(?:전적검색|전적)\s*/u, "").trim();
  if (query.length < 1 || query.length > 64 || /[\u0000-\u001F\u007F]/u.test(query)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return query;
}

export function parsePlayerSearchBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["query"])) throw new KakaoAssistantError("INVALID_INPUT");
  return Object.freeze({ command: "SEARCH_PLAYER" as const, query: parseKakaoPlayerQuery(value.query) });
}

export function parseOpenChatBody(value: unknown) {
  if (!isRecord(value) || typeof value.command !== "string") throw new KakaoAssistantError("INVALID_INPUT");
  if (value.command === "STATUS" && hasExactKeys(value, ["command"])) {
    return Object.freeze({ command: "STATUS" as const });
  }
  if (value.command === "SEARCH_PLAYER" && hasExactKeys(value, ["command", "query"])) {
    return Object.freeze({ command: "SEARCH_PLAYER" as const, query: parseKakaoPlayerQuery(value.query) });
  }
  throw new KakaoAssistantError("INVALID_INPUT");
}

export function parseScheduledNoticeBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, value.slot === undefined ? [] : ["slot"])) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  if (value.slot === undefined || value.slot === null) return Object.freeze({ slot: null });
  if ((typeof value.slot !== "string" && typeof value.slot !== "number") || String(value.slot).length > 32) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const slot = String(value.slot).normalize("NFKC").trim();
  if (!slot || /[\u0000-\u001F\u007F]/u.test(slot)) throw new KakaoAssistantError("INVALID_INPUT");
  return Object.freeze({ slot });
}

export function parseManagedOperationFormBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["command", "formType", "payload"]) || value.command !== "SUBMIT_OPERATION_FORM") {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return Object.freeze({ formType: value.formType, payload: value.payload });
}

export function toKakaoPlayerSearchItem(player: PlayerSummary): KakaoPlayerSearchItemDto {
  return Object.freeze({
    playerId: player.id,
    displayName: player.displayName,
    riotId: player.riotId,
    mainPosition: player.mainPosition,
    tier: player.tier,
  });
}

export function kakaoReadIdentity(input: Readonly<{ principalId: string; scope: string; requestKey: string; bodyDigestHex: string }>) {
  const keyHash = createHash("sha256").update(`klol-v2:kakao-read-key:v1\0${input.requestKey}`).digest();
  const requestHash = createHash("sha256").update([
    "klol-v2:kakao-read-request:v1", input.principalId, input.scope, input.bodyDigestHex,
  ].join("\0")).digest();
  return Object.freeze({ keyHash, requestHash });
}
