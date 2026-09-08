import { PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";

export const MATCH_TEAMS = ["BLUE", "RED"] as const;
export const MATCH_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export const MATCH_SERIES_STATUSES = ["DRAFT", "PUBLISHED", "VOIDED"] as const;
export const MATCH_SUBMISSION_STATUSES = [
  "AWAITING_UPLOAD",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type MatchTeam = (typeof MATCH_TEAMS)[number];
export type MatchPosition = (typeof MATCH_POSITIONS)[number];
export type MatchSeriesStatus = (typeof MATCH_SERIES_STATUSES)[number];
export type MatchSubmissionStatus = (typeof MATCH_SUBMISSION_STATUSES)[number];

export const MVP_FORMULA = Object.freeze({
  version: "V1_COMPAT_1",
  scoreUnitDivisor: 2,
  killsWeightUnits2: 6,
  assistsWeightUnits2: 3,
  deathsWeightUnits2: -4,
  baseBonusUnits2: 10,
});
export const MVP_SELECTION = "WINNER_SCORE_KDA_PLAYER_ID_V1" as const;

export const MATCH_COMMAND_RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;
export const MATCH_IMAGE_MAX_BYTES = PRIVATE_ASSET_MAX_BYTES;
export const MATCH_IMAGE_MAX_COUNT = 5;
export const MATCH_UPLOAD_RESERVATION_TTL_MS = 5 * 60 * 1_000;
export const MATCH_OCR_RESERVATION_TTL_MS = 60 * 1_000;
export const MATCH_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type MatchParticipantInput = Readonly<{
  playerId: string;
  championKey: string;
  team: MatchTeam;
  position: MatchPosition;
  kills: number;
  deaths: number;
  assists: number;
}>;

export type MatchGameInput = Readonly<{
  gameNumber: number;
  durationSeconds: number;
  winnerTeam: MatchTeam;
  participants: readonly MatchParticipantInput[];
}>;

export type MatchParticipantIdentity = Readonly<{
  playerId: string;
  nickname: string;
  tagLine: string;
}>;

/** Server-owned display identity recorded with a participant row. */
export type MatchParticipantSnapshot = MatchParticipantInput &
  Readonly<{
    nicknameSnapshot: string;
    tagLineSnapshot: string;
  }>;

export type MatchGameSnapshot = Omit<MatchGameInput, "participants"> &
  Readonly<{
    participants: readonly MatchParticipantSnapshot[];
  }>;

export type MatchScheduleInput = Readonly<{
  playedOn: string;
  startedAt: Date | null;
  startedAtOffsetMinutes: number | null;
}>;

export type MatchRecordInput = MatchScheduleInput &
  Readonly<{
    seasonId: string;
    title: string;
    games: readonly MatchGameInput[];
  }>;

export type MatchSeriesProvenance = Readonly<{
  teamBalanceDraftId: string | null;
}>;

export const EMPTY_MATCH_SERIES_PROVENANCE: MatchSeriesProvenance = Object.freeze({
  teamBalanceDraftId: null,
});

export function matchSeriesProvenanceFromSubmission(
  submission: Readonly<{ teamBalanceDraftId: string | null }>,
): MatchSeriesProvenance {
  return { teamBalanceDraftId: submission.teamBalanceDraftId };
}

export type MatchSubmissionCreateInput = MatchScheduleInput &
  Readonly<{
    requestId: string;
    seasonId: string | null;
    title: string;
    organizer: string;
    seriesNumber: number;
    note: string | null;
    expectedGameCount: number;
    teamBalanceDraftId: string | null;
  }>;

export type MatchSubmissionUpdateInput = Omit<MatchSubmissionCreateInput, "requestId">;

export type AdminMatchImportInput = MatchScheduleInput & Readonly<{
  seasonId: string | null;
  title: string;
}>;

export type PublicMatchPlayer = Readonly<{
  playerId: string;
  profileAvailable: boolean;
  nickname: string;
  tagLine: string;
  championKey: string;
  championName: string;
  championImageUrl: string | null;
  team: MatchTeam;
  position: MatchPosition;
  kills: number;
  deaths: number;
  assists: number;
  mvpScore: number;
}>;

export function toPublicMatchPlayerDto(value: PublicMatchPlayer): PublicMatchPlayer {
  return {
    playerId: value.playerId,
    profileAvailable: value.profileAvailable,
    nickname: value.nickname,
    tagLine: value.tagLine,
    championKey: value.championKey,
    championName: value.championName,
    championImageUrl: value.championImageUrl,
    team: value.team,
    position: value.position,
    kills: value.kills,
    deaths: value.deaths,
    assists: value.assists,
    mvpScore: value.mvpScore,
  };
}

export type PublicMatchGame = Readonly<{
  gameNumber: number;
  durationSeconds: number;
  winnerTeam: MatchTeam;
  mvpPlayerId: string;
  participants: readonly PublicMatchPlayer[];
}>;

export type PublicMatchSummary = Readonly<{
  id: string;
  title: string;
  playedOn: string;
  startedAt: string | null;
  season: Readonly<{ id: string; name: string }>;
  blueWins: number;
  redWins: number;
  gameCount: number;
}>;

export type PublicMatchDetail = PublicMatchSummary &
  Readonly<{
    games: readonly PublicMatchGame[];
    formulaVersion: string;
  }>;

export type PublicMatchPage = Readonly<{
  items: readonly PublicMatchSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  nextCursor: string | null;
}>;

export type MatchSubmissionView = Readonly<{
  id: string;
  publicCode: string;
  seasonId: string | null;
  seasonName: string | null;
  title: string;
  organizer: string;
  seriesNumber: number;
  note: string | null;
  playedOn: string;
  startedAt: string | null;
  expectedGameCount: number;
  teamBalanceDraftId: string | null;
  source: "WEB" | "KAKAO" | "ADMIN";
  receivedGameNumbers: readonly number[];
  status: MatchSubmissionStatus;
  publicReviewReason: string | null;
  approvedMatchSeriesId: string | null;
  revision: number;
  updatedAt: string;
}>;

export type AdminMatchView = Readonly<{
  id: string;
  legacyId: number | null;
  seasonId: string;
  seasonName: string;
  teamBalanceDraftId: string | null;
  title: string;
  playedOn: string;
  startedAt: string | null;
  startedAtOffsetMinutes: number | null;
  status: MatchSeriesStatus;
  voidReason: string | null;
  revision: number;
  gameCount: number;
  blueWins: number;
  redWins: number;
  updatedAt: string;
}>;

export type AdminSubmissionView = MatchSubmissionView &
  Readonly<{
    ownerUserAccountId: string | null;
    reviewerUserAccountId: string | null;
    reviewedAt: string | null;
    reviewedResult: Record<string, unknown> | null;
    images: readonly Readonly<{
      id: string;
      gameNumber: number;
      contentType: string;
      byteSize: number;
      sha256: string;
      assetStatus: "STAGED" | "READY" | "DELETE_PENDING";
      ocrStatus: "NOT_REQUESTED" | "PENDING" | "SUCCEEDED" | "FAILED";
      ocrCandidate: Record<string, unknown> | null;
      ocrErrorCode: string | null;
      revision: number;
    }>[];
  }>;

export type OwnSubmissionPage = Readonly<{
  items: readonly MatchSubmissionView[];
  nextCursor: string | null;
}>;

export type MatchErrorCode =
  | "DUPLICATE"
  | "FORBIDDEN"
  | "IDEMPOTENCY_MISMATCH"
  | "IMAGE_LIMIT"
  | "INVALID_IMAGE"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED"
  | "PRIVATE_STORAGE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "SESSION_CHANGED";

export class MatchServiceError extends Error {
  constructor(
    readonly code: MatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MatchServiceError";
  }
}

export function captureMatchGameSnapshots(
  games: readonly MatchGameInput[],
  identities: readonly MatchParticipantIdentity[],
  previousGames: readonly MatchGameSnapshot[] = [],
): readonly MatchGameSnapshot[] {
  const currentIdentityByPlayerId = new Map(
    identities.map((identity) => [identity.playerId, identity] as const),
  );
  const previousIdentityByPlayerId = new Map<string, Readonly<{
    nicknameSnapshot: string;
    tagLineSnapshot: string;
  }>>();

  for (const game of previousGames) {
    for (const participant of game.participants) {
      const existing = previousIdentityByPlayerId.get(participant.playerId);
      if (
        existing &&
        (existing.nicknameSnapshot !== participant.nicknameSnapshot ||
          existing.tagLineSnapshot !== participant.tagLineSnapshot)
      ) {
        throw new MatchServiceError(
          "INVALID_INPUT",
          "기존 경기의 참가자 표시 이름 스냅샷이 서로 일치하지 않습니다.",
        );
      }
      previousIdentityByPlayerId.set(participant.playerId, {
        nicknameSnapshot: participant.nicknameSnapshot,
        tagLineSnapshot: participant.tagLineSnapshot,
      });
    }
  }

  return games.map((game) => ({
    gameNumber: game.gameNumber,
    durationSeconds: game.durationSeconds,
    winnerTeam: game.winnerTeam,
    participants: game.participants.map((participant) => {
      const previousIdentity = previousIdentityByPlayerId.get(participant.playerId);
      const currentIdentity = currentIdentityByPlayerId.get(participant.playerId);
      if (!previousIdentity && !currentIdentity) {
        throw new MatchServiceError(
          "INVALID_INPUT",
          "등록되지 않은 플레이어의 표시 이름은 기록할 수 없습니다.",
        );
      }
      return {
        ...participant,
        nicknameSnapshot: previousIdentity?.nicknameSnapshot ?? currentIdentity!.nickname,
        tagLineSnapshot: previousIdentity?.tagLineSnapshot ?? currentIdentity!.tagLine,
      };
    }),
  }));
}

export function toMatchGameInput(game: MatchGameSnapshot): MatchGameInput {
  return {
    gameNumber: game.gameNumber,
    durationSeconds: game.durationSeconds,
    winnerTeam: game.winnerTeam,
    participants: game.participants.map((participant) => ({
      playerId: participant.playerId,
      championKey: participant.championKey,
      team: participant.team,
      position: participant.position,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
    })),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MATCH_SUBMISSION_PUBLIC_CODE_PATTERN = /^MR2[0-9A-F]{16}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const CONTROL_OR_BIDI_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function safeText(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    CONTROL_OR_BIDI_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function normalizedMatchIdentity(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function canonicalUuid(value: unknown): string | null {
  return isUuid(value) ? value.toLocaleLowerCase("en-US") : null;
}

export function canonicalSubmissionPublicCode(value: unknown): string | null {
  return typeof value === "string" && MATCH_SUBMISSION_PUBLIC_CODE_PATTERN.test(value)
    ? value
    : null;
}

export function parseKstDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
    ? value
    : null;
}

export function parseStartedAt(
  value: unknown,
  playedOn: string,
): Pick<MatchScheduleInput, "startedAt" | "startedAtOffsetMinutes"> | null {
  if (value === null) return { startedAt: null, startedAtOffsetMinutes: null };
  if (typeof value !== "string") return null;
  const match = OFFSET_DATE_TIME_PATTERN.exec(value);
  if (!match || match[1] !== playedOn) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const offsetText = match[2];
  if (offsetText === "Z") return { startedAt: date, startedAtOffsetMinutes: 0 };
  const sign = offsetText.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offsetText.slice(1).split(":").map(Number);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  return { startedAt: date, startedAtOffsetMinutes: sign * (hours * 60 + minutes) };
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null;
}

export function calculateMvpScoreUnits2(
  participant: Pick<MatchParticipantInput, "kills" | "deaths" | "assists">,
) {
  return (
    participant.kills * MVP_FORMULA.killsWeightUnits2 +
    participant.assists * MVP_FORMULA.assistsWeightUnits2 +
    participant.deaths * MVP_FORMULA.deathsWeightUnits2 +
    MVP_FORMULA.baseBonusUnits2
  );
}

export function calculateMvpScore(
  participant: Pick<MatchParticipantInput, "kills" | "deaths" | "assists">,
) {
  return calculateMvpScoreUnits2(participant) / MVP_FORMULA.scoreUnitDivisor;
}

export function selectGameMvp(game: MatchGameInput) {
  const winnerParticipants = game.participants
    .filter((participant) => participant.team === game.winnerTeam)
    .map((participant) => ({
      ...participant,
      scoreUnits2: calculateMvpScoreUnits2(participant),
    }))
    .sort(
      (left, right) =>
        right.scoreUnits2 - left.scoreUnits2 ||
        right.kills - left.kills ||
        left.deaths - right.deaths ||
        right.assists - left.assists ||
        (left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0),
    );
  const selected = winnerParticipants[0];
  if (!selected) throw new MatchServiceError("INVALID_INPUT", "승리팀 MVP 후보가 없습니다.");
  return {
    playerId: selected.playerId,
    scoreUnits2: selected.scoreUnits2,
    score: selected.scoreUnits2 / MVP_FORMULA.scoreUnitDivisor,
    formulaVersion: MVP_FORMULA.version,
    selection: MVP_SELECTION,
  };
}

function parseParticipant(value: unknown): MatchParticipantInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["playerId", "championKey", "team", "position", "kills", "deaths", "assists"]) ||
    !isUuid(value.playerId)
  ) {
    return null;
  }
  const championText = safeText(value.championKey, 1, 64);
  const championKey = championText?.toLocaleLowerCase("en-US") ?? null;
  const team = MATCH_TEAMS.find((candidate) => candidate === value.team);
  const position = MATCH_POSITIONS.find((candidate) => candidate === value.position);
  const kills = safeInteger(value.kills, 0, 999);
  const deaths = safeInteger(value.deaths, 0, 999);
  const assists = safeInteger(value.assists, 0, 999);
  if (
    !championKey ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(championKey) ||
    !team ||
    !position ||
    kills === null ||
    deaths === null ||
    assists === null
  ) {
    return null;
  }
  return {
    playerId: value.playerId.toLocaleLowerCase("en-US"),
    championKey,
    team,
    position,
    kills,
    deaths,
    assists,
  };
}

function parseGames(value: unknown, expectedCount?: number): readonly MatchGameInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 9) return null;
  if (expectedCount !== undefined && value.length !== expectedCount) return null;
  const games: MatchGameInput[] = [];
  for (const [index, candidate] of value.entries()) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["gameNumber", "durationSeconds", "winnerTeam", "participants"])
    ) {
      return null;
    }
    const gameNumber = safeInteger(candidate.gameNumber, 1, 9);
    const durationSeconds = safeInteger(candidate.durationSeconds, 60, 7200);
    const winnerTeam = MATCH_TEAMS.find((team) => team === candidate.winnerTeam);
    if (gameNumber !== index + 1 || durationSeconds === null || !winnerTeam) return null;
    if (!Array.isArray(candidate.participants) || candidate.participants.length !== 10) return null;
    const participants = candidate.participants.map(parseParticipant);
    if (participants.some((participant) => participant === null)) return null;
    const parsed = participants as MatchParticipantInput[];
    const playerIds = new Set(parsed.map((participant) => participant.playerId));
    const championKeys = new Set(parsed.map((participant) => participant.championKey));
    if (playerIds.size !== 10 || championKeys.size !== 10) return null;
    for (const team of MATCH_TEAMS) {
      const teamParticipants = parsed.filter((participant) => participant.team === team);
      if (teamParticipants.length !== 5) return null;
      if (new Set(teamParticipants.map((participant) => participant.position)).size !== 5) return null;
      if (!MATCH_POSITIONS.every((position) => teamParticipants.some((item) => item.position === position))) {
        return null;
      }
    }
    games.push({ gameNumber, durationSeconds, winnerTeam, participants: parsed });
  }
  return games;
}

export function parseMatchRecordInput(value: unknown): MatchRecordInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["seasonId", "title", "playedOn", "startedAt", "games"]) ||
    !isUuid(value.seasonId)
  ) {
    return null;
  }
  const title = safeText(value.title, 2, 160);
  const playedOn = parseKstDate(value.playedOn);
  const games = parseGames(value.games);
  if (!title || !playedOn || !games) return null;
  const schedule = parseStartedAt(value.startedAt, playedOn);
  return schedule
    ? {
        seasonId: value.seasonId.toLocaleLowerCase("en-US"),
        title,
        playedOn,
        ...schedule,
        games,
      }
    : null;
}

export function parseAdminMatchImportInput(value: unknown): AdminMatchImportInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["seasonId", "title", "playedOn", "startedAt"]) ||
    !(value.seasonId === null || isUuid(value.seasonId))
  ) {
    return null;
  }
  const title = safeText(value.title, 2, 160);
  const playedOn = parseKstDate(value.playedOn);
  if (!title || !playedOn) return null;
  const schedule = parseStartedAt(value.startedAt, playedOn);
  return schedule
    ? {
        seasonId: typeof value.seasonId === "string"
          ? value.seasonId.toLocaleLowerCase("en-US")
          : null,
        title,
        playedOn,
        ...schedule,
      }
    : null;
}

export function parseReviewedGames(value: unknown, expectedCount: number): readonly MatchGameInput[] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["formulaVersion", "games"])) return null;
  if (value.formulaVersion !== MVP_FORMULA.version) return null;
  return parseGames(value.games, expectedCount);
}

export function parseSubmissionCreateInput(value: unknown): MatchSubmissionCreateInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "requestId",
      "seasonId",
      "title",
      "organizer",
      "seriesNumber",
      "note",
      "playedOn",
      "startedAt",
      "expectedGameCount",
      "teamBalanceDraftId",
    ]) ||
    !(value.seasonId === null || isUuid(value.seasonId))
  ) {
    return null;
  }
  const requestId = safeText(value.requestId, 8, 100);
  const title = safeText(value.title, 2, 160);
  const organizer = safeText(value.organizer, 1, 100);
  const seriesNumber = safeInteger(value.seriesNumber, 1, Number.MAX_SAFE_INTEGER);
  const note = value.note === null ? null : safeText(value.note, 1, 1000);
  const playedOn = parseKstDate(value.playedOn);
  const expectedGameCount = value.expectedGameCount === 2 || value.expectedGameCount === 3
    ? value.expectedGameCount
    : null;
  const teamBalanceDraftId =
    value.teamBalanceDraftId === null
      ? null
      : isUuid(value.teamBalanceDraftId)
        ? value.teamBalanceDraftId.toLocaleLowerCase("en-US")
        : undefined;
  if (
    !requestId ||
    !title ||
    !organizer ||
    seriesNumber === null ||
    (value.note !== null && note === null) ||
    !playedOn ||
    expectedGameCount === null ||
    teamBalanceDraftId === undefined
  ) return null;
  const schedule = parseStartedAt(value.startedAt, playedOn);
  return schedule
    ? {
        requestId,
        seasonId:
          typeof value.seasonId === "string"
            ? value.seasonId.toLocaleLowerCase("en-US")
            : null,
        title,
        organizer,
        seriesNumber,
        note,
        playedOn,
        ...schedule,
        expectedGameCount,
        teamBalanceDraftId,
      }
    : null;
}

export function parseSubmissionUpdateInput(value: unknown): MatchSubmissionUpdateInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "seasonId",
      "title",
      "organizer",
      "seriesNumber",
      "note",
      "playedOn",
      "startedAt",
      "expectedGameCount",
      "teamBalanceDraftId",
    ])
  ) {
    return null;
  }
  const parsed = parseSubmissionCreateInput({ ...value, requestId: "update-request-v1" });
  if (!parsed) return null;
  return {
    seasonId: parsed.seasonId,
    title: parsed.title,
    organizer: parsed.organizer,
    seriesNumber: parsed.seriesNumber,
    note: parsed.note,
    playedOn: parsed.playedOn,
    startedAt: parsed.startedAt,
    startedAtOffsetMinutes: parsed.startedAtOffsetMinutes,
    expectedGameCount: parsed.expectedGameCount,
    teamBalanceDraftId: parsed.teamBalanceDraftId,
  };
}

export function parseReviewResultInput(
  value: unknown,
  expectedGameCount: number,
): Record<string, unknown> | null {
  const games = parseReviewedGames(value, expectedGameCount);
  return games
    ? {
        formulaVersion: MVP_FORMULA.version,
        games: games.map((game) => ({
          ...game,
          participants: game.participants.map((participant) => ({ ...participant })),
        })),
      }
    : null;
}

export function parseReason(value: unknown): string | null {
  return safeText(value, 3, 1000);
}

export function parseOptionalLegacyId(value: unknown): number | null | "INVALID" {
  if (value === null) return null;
  return safeInteger(value, 1, 2_147_483_647) ?? "INVALID";
}

export function parseExpectedRevision(value: unknown): number | null {
  return safeInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled match domain value: ${String(value)}`);
}
