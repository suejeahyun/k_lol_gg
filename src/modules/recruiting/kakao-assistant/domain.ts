import { createHash } from "node:crypto";

import type { PlayerSummary } from "@/modules/players/domain/player";
import {
  KAKAO_V4_EVENT_SCOPE,
  hashKakaoV4EventId,
  kakaoV4EventRequestFingerprint,
} from "../application/commands";
import {
  isSeasonApplicationPosition,
  type SeasonApplicationSource,
  type SeasonApplicationStatus,
  type SeasonApplicationPosition,
} from "@/modules/seasons/domain/season";

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
  nextPartyRecruitNumber: number | null;
  nextPartyResetSequence: number;
  nextScrimNumber: number | null;
  partiesTruncated: boolean;
  scrimsTruncated: boolean;
  parties: readonly Readonly<{
    id: string;
    revision: number;
    recruitDate: string;
    resetSequence: number;
    recruitNumber: number;
    type: "FLEX_RANK" | "NORMAL_GAME" | "SOLO_RANK" | "ARAM" | "TFT_NORMAL" | "TFT_RANK" | "DOUBLE_UP" | "PARTY_NUMBER" | "PARTY_RIFT" | "OTHER_GAME";
    title: string;
    status: "IN_PROGRESS";
    memberCount: number;
    reserveCount: number;
    maximumMembers: number;
    members: readonly Readonly<{
      name: string;
      position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
      slotNo: number;
      substitute: boolean;
    }>[];
    startTimeText: string;
    gameInfo: string;
    scheduledStartAt: string | null;
  }>[];
  scrims: readonly Readonly<{
    id: string;
    revision: number;
    recruitDate: string;
    scrimNumber: number;
    tournamentId: string | null;
    legacyTournamentNumber: number | null;
    requesterTeamId: string | null;
    opponentTeamId: string | null;
    requesterTeamName: string | null;
    opponentTeamName: string | null;
    title: string | null;
    requesterLineup: Readonly<{ top: string | null; jungle: string | null; mid: string | null; adc: string | null; support: string | null }> | null;
    opponentLineup: Readonly<{ top: string | null; jungle: string | null; mid: string | null; adc: string | null; support: string | null }> | null;
    memo: string | null;
    seriesRuleText: string | null;
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

export type KakaoV4StaticReceiptDto = Readonly<{
  kind: "KAKAO_V4_STATIC_RECEIPT";
  receiptVersion: 1;
  legacyReply: string;
}>;

export type KakaoSeasonSnapshotParticipant = Readonly<{
  slotNo: number;
  name: string;
  riotId: string | null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  reserve: boolean;
  /** In-process V4 only; forces an otherwise parseable row into manual review. */
  reviewRequired?: true;
}>;

export type KakaoSeasonRoundMetadataDto = Readonly<{
  recruitNo: number;
  mode: "RIFT" | "ARAM" | "AUGMENT_ARAM";
  capacity: number;
  startTimeText: string | null;
  scheduledStartAt: string | null;
  noticeText: string | null;
  revision: number;
}>;

type KakaoSeasonSnapshotCommandBase = Readonly<{
  /** Null is accepted only by the in-process V4 dispatcher for exact-one-active-season resolution. */
  seasonId: string | null;
  applyDate: string;
}>;

export type KakaoSeasonSnapshotCommand =
  | (KakaoSeasonSnapshotCommandBase & Readonly<{
      action: "SYNC";
      recruitNo: number;
      mode: "RIFT" | "ARAM" | "AUGMENT_ARAM";
      roundMetadata?: Readonly<{
        capacity: number;
        startTimeText: string | null;
        scheduledStartAt: string | null;
        noticeText: string | null;
      }>;
      participants: readonly KakaoSeasonSnapshotParticipant[];
      /** In-process V4 only; absent numbered rows preserve their current state. */
      preserveSlotNos?: readonly number[];
    }>)
  | (KakaoSeasonSnapshotCommandBase & Readonly<{
      action: "CANCEL";
      recruitNo: number;
      mode: "RIFT" | "ARAM" | "AUGMENT_ARAM";
      participants: readonly KakaoSeasonSnapshotParticipant[];
    }>)
  | (KakaoSeasonSnapshotCommandBase & Readonly<{
      action: "STATUS";
      recruitNo: number | null;
      participants: readonly KakaoSeasonSnapshotParticipant[];
  }>);

export type KakaoSeasonCommandAccess = "MEMBER_SAFE" | "TRUSTED_OPERATOR";

/** Kakao room members may submit/read snapshots; explicit force-cancel stays operator-only. */
export function kakaoSeasonCommandAccess(action: KakaoSeasonSnapshotCommand["action"]): KakaoSeasonCommandAccess {
  return action === "CANCEL" ? "TRUSTED_OPERATOR" : "MEMBER_SAFE";
}

export type KakaoSeasonSnapshotEntryDto = Readonly<{
  slotNo: number;
  status: SeasonApplicationStatus | "MATCHED_RESERVE" | "UNMATCHED" | "AMBIGUOUS";
  source: SeasonApplicationSource;
  suppliedName: string;
  suppliedRiotId: string | null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  player: Readonly<{ playerId: string; displayName: string; riotId: string }> | null;
}>;

export type KakaoPlayerRecordDto = Readonly<{
  kind: "PLAYER_RECORD";
  mode: "RECORD" | "RECENT";
  query: string;
  player: Readonly<{ playerId: string; displayName: string; riotId: string }> | null;
  currentTier: string | null;
  peakTier: string | null;
  season: Readonly<{ id: string; name: string }> | null;
  summary: Readonly<{
    totalGames: number;
    participationCount: number;
    wins: number;
    losses: number;
    winRate: number;
    mvpCount: number;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
  }> | null;
  recentMatches: readonly Readonly<{
    matchId: string;
    title: string;
    playedOn: string;
    gameNumber: number;
    championName: string;
    team: "BLUE" | "RED";
    position: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
    won: boolean;
    mvp: boolean;
    kills: number;
    deaths: number;
    assists: number;
  }>[];
}>;

export type KakaoRankingDto = Readonly<{
  kind: "RANKING";
  season: Readonly<{ id: string; name: string }> | null;
  minimumParticipation: number;
  rows: readonly Readonly<{
    rank: number;
    playerId: string;
    displayName: string;
    riotId: string;
    totalGames: number;
    participationCount: number;
    wins: number;
    losses: number;
    winRate: number;
    mvpCount: number;
    kda: number;
  }>[];
  truncated: boolean;
}>;

export type KakaoSeasonSnapshotDto = Readonly<{
  kind: "SEASON_APPLICATION_SNAPSHOT";
  seasonId: string;
  applyDate: string;
  recruitNo: number | null;
  entries: readonly KakaoSeasonSnapshotEntryDto[];
  appliedCount: number;
  reserveCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  createdCount?: number;
  updatedCount?: number;
  mode?: "RIFT" | "ARAM" | "AUGMENT_ARAM";
  metadataUpdated?: boolean;
  roundMetadata?: KakaoSeasonRoundMetadataDto | null;
  roundMetadataList?: readonly KakaoSeasonRoundMetadataDto[];
  availableRecruitNos?: readonly number[];
  legacyReply?: string;
  v1StrictLegacyReply?: string;
}>;

export type KakaoImageReceiveCommand = Readonly<{
  sessionId: string;
  base64Image: string;
  declaredContentType: "image/png" | "image/jpeg" | "image/webp";
  declaredSha256Hex: string;
  originalFileName: string | null;
}>;

export type KakaoImageSessionCommand = Readonly<{
  roomId: string;
  senderId: string;
}>;

export type KakaoImageSessionDto = Readonly<{
  kind: "KAKAO_IMAGE_SESSION";
  sessionId: string;
  targetType: "MATCH_SUBMISSION" | "DISCIPLINE_TASK";
  receivedImageCount: number;
  expectedImageCount: number;
  status: "ACTIVE" | "CANCELLED";
  expiresAt: string;
}>;

export type KakaoImageReceiveDto = Readonly<{
  kind: "KAKAO_IMAGE_RECEIVED";
  assetId: string;
  imageNumber: number;
  receivedImageCount: number;
  expectedImageCount: number;
  completed: boolean;
}>;

export type KakaoAssistantResponse =
  | KakaoPlayerSearchDto
  | KakaoPlayerRecordDto
  | KakaoRankingDto
  | KakaoOpenChatStatusDto
  | KakaoScheduledNoticeDto
  | KakaoV4StaticReceiptDto
  | KakaoSeasonSnapshotDto
  | KakaoImageReceiveDto;

export class KakaoAssistantError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "IDEMPOTENCY_MISMATCH" | "NONCE_CONFLICT" | "INCOMPLETE_RECEIPT" | "NOT_FOUND" | "CONFLICT" | "INVALID_STATE" | "FORBIDDEN" | "PRECONDITION_FAILED") {
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
  if ((value.command === "RECORD" || value.command === "RECENT") && hasExactKeys(value, ["command", "query"])) {
    return Object.freeze({ command: value.command, query: parseKakaoPlayerQuery(value.query) });
  }
  if (value.command === "RANKING" && hasExactKeys(value, ["command"])) {
    return Object.freeze({ command: "RANKING" as const });
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") throw new KakaoAssistantError("INVALID_INPUT");
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximum || UNSAFE_TEXT.test(normalized)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return normalized;
}

function seasonParticipant(value: unknown): KakaoSeasonSnapshotParticipant {
  if (!isRecord(value) || !hasExactKeys(value, ["slotNo", "name", "riotId", "mainPosition", "subPositions", "reserve"])) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  if (!Number.isSafeInteger(value.slotNo) || Number(value.slotNo) < 1 || Number(value.slotNo) > 99 ||
      typeof value.reserve !== "boolean" || !isSeasonApplicationPosition(value.mainPosition) ||
      !Array.isArray(value.subPositions) || value.subPositions.length > 5 ||
      !value.subPositions.every(isSeasonApplicationPosition)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const subPositions = [...new Set(value.subPositions as SeasonApplicationPosition[])];
  if (subPositions.length !== value.subPositions.length || subPositions.includes(value.mainPosition) ||
      (value.mainPosition === "ALL" && subPositions.length > 0) || subPositions.includes("ALL")) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const riotId = value.riotId === null ? null : boundedText(value.riotId, 97);
  if (riotId !== null && !/^.{1,64}#[^#]{1,32}$/u.test(riotId)) throw new KakaoAssistantError("INVALID_INPUT");
  return Object.freeze({
    slotNo: Number(value.slotNo),
    name: boundedText(value.name, 100),
    riotId,
    mainPosition: value.mainPosition,
    subPositions: Object.freeze(subPositions),
    reserve: value.reserve,
  });
}

export function parseSeasonSnapshotBody(value: unknown): KakaoSeasonSnapshotCommand {
  if (!isRecord(value) || typeof value.action !== "string") throw new KakaoAssistantError("INVALID_INPUT");
  const mutation = value.action === "SYNC";
  const authoritativeMutation = value.action === "SYNC" || value.action === "CANCEL";
  if (!hasExactKeys(value, mutation
    ? ["action", "seasonId", "applyDate", "recruitNo", "mode", "participants"]
    : authoritativeMutation
      ? ["action", "seasonId", "applyDate", "recruitNo", "mode"]
      : ["action", "seasonId", "applyDate", "recruitNo"])) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const statusAllRounds = value.action === "STATUS" && value.recruitNo === null;
  if (!["SYNC", "CANCEL", "STATUS"].includes(value.action) || typeof value.seasonId !== "string" ||
      !UUID.test(value.seasonId) || typeof value.applyDate !== "string" || !DATE.test(value.applyDate) ||
      (authoritativeMutation && value.mode !== "RIFT") ||
      (!statusAllRounds && (!Number.isSafeInteger(value.recruitNo) || Number(value.recruitNo) < 1 || Number(value.recruitNo) > 999))) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const participants = mutation
    ? (Array.isArray(value.participants) && value.participants.length <= 99
      ? value.participants.map(seasonParticipant)
      : (() => { throw new KakaoAssistantError("INVALID_INPUT"); })())
    : [];
  if (new Set(participants.map((participant) => participant.slotNo)).size !== participants.length) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  if (value.action === "SYNC") return Object.freeze({
    action: "SYNC" as const,
    seasonId: value.seasonId,
    applyDate: value.applyDate,
    recruitNo: Number(value.recruitNo),
    mode: "RIFT" as const,
    participants: Object.freeze(participants),
  });
  if (value.action === "CANCEL") return Object.freeze({
    action: "CANCEL" as const,
    seasonId: value.seasonId,
    applyDate: value.applyDate,
    recruitNo: Number(value.recruitNo),
    mode: "RIFT" as const,
    participants: Object.freeze(participants),
  });
  return Object.freeze({
    action: "STATUS" as const,
    seasonId: value.seasonId,
    applyDate: value.applyDate,
    recruitNo: statusAllRounds ? null : Number(value.recruitNo),
    participants: Object.freeze(participants),
  });
}

export function parseKakaoImageReceiveBody(value: unknown): KakaoImageReceiveCommand {
  if (!isRecord(value) || !hasExactKeys(value, [
    "sessionId", "base64Image", "declaredContentType", "declaredSha256Hex", "originalFileName",
  ])) throw new KakaoAssistantError("INVALID_INPUT");
  if (typeof value.sessionId !== "string" || !UUID.test(value.sessionId) ||
      typeof value.base64Image !== "string" || value.base64Image.length < 16 || value.base64Image.length > 4_000_000 ||
      value.base64Image.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.base64Image) ||
      !["image/png", "image/jpeg", "image/webp"].includes(String(value.declaredContentType)) ||
      typeof value.declaredSha256Hex !== "string" || !/^[a-f0-9]{64}$/u.test(value.declaredSha256Hex) ||
      (value.originalFileName !== null && (typeof value.originalFileName !== "string" || value.originalFileName.length > 255))) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return Object.freeze({
    sessionId: value.sessionId,
    base64Image: value.base64Image,
    declaredContentType: value.declaredContentType as KakaoImageReceiveCommand["declaredContentType"],
    declaredSha256Hex: value.declaredSha256Hex,
    originalFileName: value.originalFileName as string | null,
  });
}

export function parseKakaoImageSessionBody(value: unknown): KakaoImageSessionCommand {
  if (!isRecord(value) || !hasExactKeys(value, ["roomId", "senderId"])) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,127}$/u;
  if (typeof value.roomId !== "string" || typeof value.senderId !== "string" ||
      !identifier.test(value.roomId) || !identifier.test(value.senderId)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return Object.freeze({ roomId: value.roomId, senderId: value.senderId });
}

export function parseKakaoImageSessionRevokeBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["sessionId"]) ||
      typeof value.sessionId !== "string" || !UUID.test(value.sessionId)) {
    throw new KakaoAssistantError("INVALID_INPUT");
  }
  return Object.freeze({ sessionId: value.sessionId });
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
  if (input.scope === KAKAO_V4_EVENT_SCOPE) {
    return Object.freeze({
      keyHash: hashKakaoV4EventId(input.requestKey),
      requestHash: kakaoV4EventRequestFingerprint({
        principalId: input.principalId,
        bodyDigestHex: input.bodyDigestHex,
      }),
    });
  }
  const keyHash = createHash("sha256").update(`klol-v2:kakao-read-key:v1\0${input.requestKey}`).digest();
  const requestHash = createHash("sha256").update([
    "klol-v2:kakao-read-request:v1", input.principalId, input.scope, input.bodyDigestHex,
  ].join("\0")).digest();
  return Object.freeze({ keyHash, requestHash });
}
