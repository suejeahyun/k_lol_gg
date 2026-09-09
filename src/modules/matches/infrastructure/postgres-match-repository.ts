import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  like,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import { auditEvents } from "@/platform/db/schema/audit";
import { championCatalog } from "@/platform/db/schema/catalog";
import {
  matchAggregateVersions,
  matchCommandReceipts,
  matchGames,
  matchParticipants,
  matchOcrReservations,
  matchRateLimitBuckets,
  matchRecalculationOutbox,
  matchSeries,
  matchSubmissionImages,
  matchSubmissions,
  matchUploadReservations,
  privateAssets,
} from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import { seasons } from "@/platform/db/schema/seasons";
import {
  teamBalanceDraftCandidates,
  teamBalanceDraftParticipants,
  teamBalanceDrafts,
} from "@/platform/db/schema/team-tools";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type { MatchTransactionAuthorizer } from "../application/ports/match-transaction-authorizer";
import type {
  AdminMatchQuery,
  AdminMatchEditorCatalog,
  AdminMatchWorkspace,
  MatchSummaryIntegrity,
  MatchCommandEnvelope,
  MatchMutationResult,
  MatchRepository,
  OwnSubmissionQuery,
  PrivateImageAttachmentInput,
  PrivateImageOcrResult,
  PrivateImageOcrReservationInput,
  PrivateImageOcrReservationResult,
  PrivateImageReadReference,
  PrivateImageUploadReservationInput,
  PrivateImageUploadReservationResult,
  PublicMatchQuery,
  SubmissionReviewDraftInput,
} from "../application/ports/match-repository";
import {
  captureMatchGameSnapshots,
  calculateMvpScoreUnits2,
  EMPTY_MATCH_SERIES_PROVENANCE,
  type AdminMatchImportInput,
  MATCH_COMMAND_RECEIPT_TTL_MS,
  MATCH_OCR_RESERVATION_TTL_MS,
  MATCH_UPLOAD_RESERVATION_TTL_MS,
  MATCH_POSITIONS,
  MATCH_TEAMS,
  MatchServiceError,
  MVP_FORMULA,
  normalizedMatchIdentity,
  parseReviewedGames,
  selectGameMvp,
  matchSeriesProvenanceFromSubmission,
  toMatchGameInput,
  toPublicMatchPlayerDto,
  type AdminMatchView,
  type AdminMatchTeamBalanceSource,
  type AdminSubmissionView,
  type MatchGameInput,
  type MatchGameSnapshot,
  type MatchParticipantIdentity,
  type MatchRecordInput,
  type MatchSeriesProvenance,
  type MatchSubmissionCreateInput,
  type MatchSubmissionUpdateInput,
  type MatchSubmissionView,
  type PublicMatchDetail,
  type PublicMatchPage,
  type PublicMatchSummary,
} from "../domain/match";
import { PostgresMatchTransactionAuthorizer } from "./postgres-match-transaction-authorizer";
import {
  encodeOwnSubmissionCursor,
  encodePublicMatchCursor,
  publicMatchFilterFingerprint,
} from "./match-query";

type MatchRow = typeof matchSeries.$inferSelect;
type SubmissionRow = typeof matchSubmissions.$inferSelect;
type SuccessfulBody = Record<string, unknown>;

const numericCount = sql<number>`count(*)::int`.mapWith(Number);
function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function resultSummary(games: readonly MatchGameInput[]) {
  return {
    blueWins: games.filter((game) => game.winnerTeam === "BLUE").length,
    redWins: games.filter((game) => game.winnerTeam === "RED").length,
    gameCount: games.length,
  } as const;
}

export function validTeamBalanceSubmissionAssignments(
  value: unknown,
  participantIds: readonly string[],
) {
  if (!Array.isArray(value) || value.length !== 10 || participantIds.length !== 10) return false;
  const expectedPlayers = new Set(participantIds);
  if (expectedPlayers.size !== 10) return false;
  const assignments = value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    return typeof record.playerId === "string" &&
      (record.team === "BLUE" || record.team === "RED") &&
      MATCH_POSITIONS.includes(record.position as (typeof MATCH_POSITIONS)[number])
      ? { playerId: record.playerId, team: record.team, position: record.position as (typeof MATCH_POSITIONS)[number] }
      : null;
  });
  if (assignments.some((entry) => entry === null)) return false;
  const normalized = assignments as readonly Readonly<{
    playerId: string;
    team: "BLUE" | "RED";
    position: (typeof MATCH_POSITIONS)[number];
  }>[];
  if (
    new Set(normalized.map((entry) => entry.playerId)).size !== 10 ||
    normalized.some((entry) => !expectedPlayers.has(entry.playerId))
  ) return false;
  return MATCH_TEAMS.every((team) => {
    const teamAssignments = normalized.filter((entry) => entry.team === team);
    return teamAssignments.length === 5 &&
      MATCH_POSITIONS.every((position) => teamAssignments.some((entry) => entry.position === position));
  });
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableMatchJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function digest(value: unknown) {
  return createHash("sha256").update(stableMatchJson(value), "utf8").digest();
}

async function databaseClock(transaction: V2Transaction) {
  const result = await transaction.execute(sql`select clock_timestamp() as value`);
  const raw = (result as unknown as { rows?: readonly { value?: unknown }[] }).rows?.[0]?.value;
  const value = raw instanceof Date ? raw : new Date(String(raw ?? ""));
  if (!Number.isFinite(value.getTime())) throw new Error("MATCH_DATABASE_CLOCK_UNAVAILABLE");
  return value;
}

export function escapeLikeLiteral(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function literalContains(column: SQLWrapper, value: string) {
  return sql`${column} ilike ${`%${escapeLikeLiteral(value)}%`} escape E'\\\\'`;
}

export function adminPlayerSearchStrategy(query: string):
  | Readonly<{ kind: "RIOT_ID_EXACT"; nickname: string; tagLine: string }>
  | Readonly<{ kind: "NORMALIZED_PREFIX"; prefix: string }> {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  const parts = normalized.split("#");
  return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])
    ? { kind: "RIOT_ID_EXACT", nickname: parts[0]!, tagLine: parts[1]! }
    : { kind: "NORMALIZED_PREFIX", prefix: `${escapeLikeLiteral(normalized)}%` };
}

function orderKey(row: Pick<MatchRow, "id" | "playedOn" | "startedAt">) {
  return `${row.playedOn}|${row.startedAt?.toISOString() ?? "UNSCHEDULED"}|${row.id}`;
}

function matchSnapshot(row: MatchRow, games?: readonly MatchGameSnapshot[]) {
  return {
    id: row.id,
    legacyId: row.legacyId,
    seasonId: row.seasonId,
    teamBalanceDraftId: row.teamBalanceDraftId,
    title: row.title,
    playedOn: row.playedOn,
    startedAt: iso(row.startedAt),
    startedAtOffsetMinutes: row.startedAtOffsetMinutes,
    blueWins: row.blueWins,
    redWins: row.redWins,
    gameCount: row.gameCount,
    status: row.status,
    voidReason: row.voidReason,
    publishedAt: iso(row.publishedAt),
    voidedAt: iso(row.voidedAt),
    revision: row.revision,
    ...(games ? { formulaVersion: MVP_FORMULA.version, games } : {}),
  };
}

export function submissionSnapshot(row: SubmissionRow) {
  return {
    id: row.id,
    publicCode: row.publicCode,
    ownerUserAccountId: row.ownerUserAccountId,
    seasonId: row.seasonId,
    title: row.title,
    organizer: row.organizer,
    seriesNumber: row.seriesNumber,
    note: row.note,
    playedOn: row.playedOn,
    startedAt: iso(row.startedAt),
    startedAtOffsetMinutes: row.startedAtOffsetMinutes,
    expectedGameCount: row.expectedGameCount,
    teamBalanceDraftId: row.teamBalanceDraftId,
    source: row.source,
    status: row.status,
    publicReviewReason: row.publicReviewReason,
    reviewedByUserAccountId: row.reviewedByUserAccountId,
    reviewedAt: iso(row.reviewedAt),
    cancelledAt: iso(row.cancelledAt),
    approvedMatchSeriesId: row.approvedMatchSeriesId,
    revision: row.revision,
  };
}

function publicSummary(row: {
  id: string;
  title: string;
  playedOn: string;
  startedAt: Date | null;
  seasonId: string;
  seasonName: string;
  blueWins: number;
  redWins: number;
  gameCount: number;
}): PublicMatchSummary {
  return {
    id: row.id,
    title: row.title,
    playedOn: row.playedOn,
    startedAt: iso(row.startedAt),
    season: { id: row.seasonId, name: row.seasonName },
    blueWins: Number(row.blueWins),
    redWins: Number(row.redWins),
    gameCount: Number(row.gameCount),
  };
}

function ownSubmission(
  row: SubmissionRow,
  seasonName: string | null,
  receivedGameNumbers: readonly number[],
): MatchSubmissionView {
  return {
    id: row.id,
    publicCode: row.publicCode,
    seasonId: row.seasonId,
    seasonName,
    title: row.title,
    organizer: row.organizer,
    seriesNumber: row.seriesNumber,
    note: row.note,
    playedOn: row.playedOn,
    startedAt: iso(row.startedAt),
    expectedGameCount: row.expectedGameCount,
    teamBalanceDraftId: row.teamBalanceDraftId,
    source: row.source,
    receivedGameNumbers,
    status: row.status,
    publicReviewReason: row.publicReviewReason,
    approvedMatchSeriesId: row.approvedMatchSeriesId,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function postgresDetails(error: unknown): { code?: string; constraint?: string } {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (typeof candidate.code === "string") {
    return {
      code: candidate.code,
      ...(typeof candidate.constraint === "string" ? { constraint: candidate.constraint } : {}),
    };
  }
  return candidate.cause ? postgresDetails(candidate.cause) : {};
}

function translateConstraint(error: unknown): never {
  const details = postgresDetails(error);
  if (details.code === "23505") {
    throw new MatchServiceError("DUPLICATE", "같은 식별 조건의 경기 또는 접수가 이미 있습니다.");
  }
  if (details.code === "23503") {
    throw new MatchServiceError("INVALID_INPUT", "연결된 시즌, 플레이어 또는 계정을 찾을 수 없습니다.");
  }
  if (details.code === "23514" || details.code === "22001") {
    throw new MatchServiceError("INVALID_INPUT", "데이터베이스 제약을 만족하지 않는 입력입니다.");
  }
  throw error;
}

async function receipt(
  executor: DatabaseExecutor,
  envelope: MatchCommandEnvelope,
  now: Date,
): Promise<MatchMutationResult<SuccessfulBody> | null> {
  const current = (
    await executor
      .select()
      .from(matchCommandReceipts)
      .where(
        and(
          eq(matchCommandReceipts.actorUserAccountId, envelope.actor.userAccountId),
          eq(matchCommandReceipts.scope, envelope.scope),
          eq(matchCommandReceipts.keyHash, envelope.keyHash),
          gt(matchCommandReceipts.expiresAt, now),
        ),
      )
      .limit(1)
  )[0];
  if (!current) return null;
  if (!Buffer.from(current.requestHash).equals(envelope.requestHash)) {
    throw new MatchServiceError(
      "IDEMPOTENCY_MISMATCH",
      "같은 멱등성 키가 다른 요청에 사용되었습니다.",
    );
  }
  const revision = current.responseJson.revision;
  return {
    body: current.responseJson,
    status: current.responseStatus,
    ...(typeof revision === "number" ? { revision } : {}),
    replayed: true,
  };
}

export class PostgresMatchRepository implements MatchRepository {
  constructor(
    private readonly database: V2Database,
    private readonly authorizer: MatchTransactionAuthorizer = new PostgresMatchTransactionAuthorizer(),
  ) {}

  private async idempotent(
    envelope: MatchCommandEnvelope,
    now: Date,
    work: (transaction: V2Transaction) => Promise<Omit<MatchMutationResult<SuccessfulBody>, "replayed">>,
  ): Promise<MatchMutationResult<SuccessfulBody>> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
        const lockMaterial = JSON.stringify([
          "klol-v2-match-receipt-lock-v1",
          envelope.actor.userAccountId,
          envelope.scope,
          envelope.keyHash.toString("hex"),
        ]);
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lockMaterial}, 0))`,
        );
        const freshNow = await databaseClock(transaction);
        await transaction
          .delete(matchCommandReceipts)
          .where(
            and(
              eq(matchCommandReceipts.actorUserAccountId, envelope.actor.userAccountId),
              eq(matchCommandReceipts.scope, envelope.scope),
              eq(matchCommandReceipts.keyHash, envelope.keyHash),
              lte(matchCommandReceipts.expiresAt, freshNow),
            ),
          );
        const replay = await receipt(transaction, envelope, freshNow);
        if (replay) return replay;
        await transaction.insert(matchCommandReceipts).values({
          id: randomUUID(),
          actorUserAccountId: envelope.actor.userAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { pending: true },
          createdAt: freshNow,
          expiresAt: new Date(freshNow.getTime() + MATCH_COMMAND_RECEIPT_TTL_MS),
        });
        const result = await work(transaction);
        await transaction
          .update(matchCommandReceipts)
          .set({
            responseStatus: result.status,
            responseJson: result.body,
            responseEtag: result.revision === undefined ? null : `"${result.revision}"`,
            targetId:
              typeof result.body.id === "string"
                ? result.body.id
                : typeof result.body.submissionId === "string"
                  ? result.body.submissionId
                  : null,
          })
          .where(
            and(
              eq(matchCommandReceipts.actorUserAccountId, envelope.actor.userAccountId),
              eq(matchCommandReceipts.scope, envelope.scope),
              eq(matchCommandReceipts.keyHash, envelope.keyHash),
            ),
          );
        return { ...result, replayed: false };
      });
    } catch (error) {
      translateConstraint(error);
    }
  }

  private async audit(
    transaction: V2Transaction,
    envelope: MatchCommandEnvelope,
    action: string,
    targetType: "MATCH_SERIES" | "MATCH_SUBMISSION" | "MATCH_SUBMISSION_IMAGE",
    targetId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    metadata?: Record<string, unknown>,
  ) {
    await transaction.insert(auditEvents).values({
      requestId: envelope.requestId,
      actorUserAccountId: envelope.actor.userAccountId,
      action,
      targetType,
      targetId,
      beforeJson: before,
      afterJson: after,
      metadataJson: metadata,
    });
  }

  private async outbox(
    transaction: V2Transaction,
    row: MatchRow,
    action: "CREATED" | "AMENDED" | "PUBLISHED" | "VOIDED" | "RESTORED",
    oldOrderKey: string | null,
    newOrderKey: string | null,
    oldSeasonId: string | null,
    newSeasonId: string | null,
    aggregateInput: unknown,
    now: Date,
  ) {
    const eventId = randomUUID();
    const inputDigest = digest(aggregateInput);
    await transaction.insert(matchRecalculationOutbox).values({
      id: eventId,
      aggregateType: "MATCH_SERIES",
      aggregateId: row.id,
      eventType: "MATCH_CHANGED",
      action,
      dedupeKey: `${row.id}:${row.revision}:${action}`,
      matchRevision: row.revision,
      teamBalanceDraftId: row.teamBalanceDraftId,
      oldSeasonId,
      newSeasonId,
      oldOrderKey,
      newOrderKey,
      inputDigest,
      payloadJson: {
        eventId,
        eventType: "MATCH_CHANGED",
        action,
        matchId: row.id,
        matchRevision: row.revision,
        teamBalanceDraftId: row.teamBalanceDraftId,
        oldSeasonId,
        newSeasonId,
        oldOrderKey,
        newOrderKey,
        inputDigest: inputDigest.toString("hex"),
      },
      status: "PENDING",
      attemptCount: 0,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  async listPublic(query: PublicMatchQuery): Promise<PublicMatchPage> {
    const baseConditions = [eq(matchSeries.status, "PUBLISHED")];
    if (query.query) {
      baseConditions.push(
        literalContains(matchSeries.titleNormalized, normalizedMatchIdentity(query.query)),
      );
    }
    if (query.seasonId) baseConditions.push(eq(matchSeries.seasonId, query.seasonId));
    if (query.from) baseConditions.push(gte(matchSeries.playedOn, query.from));
    if (query.to) baseConditions.push(lte(matchSeries.playedOn, query.to));
    if (query.winner === "BLUE") baseConditions.push(gt(matchSeries.blueWins, matchSeries.redWins));
    if (query.winner === "RED") baseConditions.push(gt(matchSeries.redWins, matchSeries.blueWins));
    if (query.winner === "TIE") baseConditions.push(eq(matchSeries.blueWins, matchSeries.redWins));
    const baseWhere = and(...baseConditions);
    const conditions = [...baseConditions];
    if (query.cursor?.sort === "title") {
      conditions.push(
        query.order === "asc"
          ? sql`(${matchSeries.titleNormalized}, ${matchSeries.id}) > (${query.cursor.titleNormalized}, ${query.cursor.id}::uuid)`
          : sql`(${matchSeries.titleNormalized}, ${matchSeries.id}) < (${query.cursor.titleNormalized}, ${query.cursor.id}::uuid)`,
      );
    }
    if (query.cursor?.sort === "playedOn") {
      const cursorStartedAt = query.cursor.startedAt
        ? new Date(query.cursor.startedAt)
        : new Date("0001-01-01T00:00:00.000Z");
      const databaseStartedAt = sql`coalesce(${matchSeries.startedAt}, '0001-01-01 00:00:00+00'::timestamptz)`;
      conditions.push(
        query.order === "asc"
          ? sql`(${matchSeries.playedOn}, ${databaseStartedAt}, ${matchSeries.id}) > (${query.cursor.playedOn}::date, ${cursorStartedAt}, ${query.cursor.id}::uuid)`
          : sql`(${matchSeries.playedOn}, ${databaseStartedAt}, ${matchSeries.id}) < (${query.cursor.playedOn}::date, ${cursorStartedAt}, ${query.cursor.id}::uuid)`,
      );
    }
    const where = and(...conditions);
    const total = Number(
      (
        await this.database
          .select({ count: numericCount })
          .from(matchSeries)
          .where(baseWhere)
      )[0]?.count ?? 0,
    );
    const direction = query.order === "asc" ? asc : desc;
    const startedOrder = sql`coalesce(${matchSeries.startedAt}, '0001-01-01 00:00:00+00'::timestamptz)`;
    const order =
      query.sort === "title"
        ? [direction(matchSeries.titleNormalized), direction(matchSeries.id)]
        : [direction(matchSeries.playedOn), direction(startedOrder), direction(matchSeries.id)];
    const rows = await this.database
      .select({
        id: matchSeries.id,
        title: matchSeries.title,
        titleNormalized: matchSeries.titleNormalized,
        playedOn: matchSeries.playedOn,
        startedAt: matchSeries.startedAt,
        seasonId: seasons.id,
        seasonName: seasons.name,
        blueWins: matchSeries.blueWins,
        redWins: matchSeries.redWins,
        gameCount: matchSeries.gameCount,
      })
      .from(matchSeries)
      .innerJoin(seasons, eq(seasons.id, matchSeries.seasonId))
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize + 1)
      .offset(query.cursor ? 0 : (query.page - 1) * query.pageSize);
    const hasMore = rows.length > query.pageSize;
    const visibleRows = rows.slice(0, query.pageSize);
    const last = visibleRows.at(-1);
    const nextCursor = hasMore && last
      ? encodePublicMatchCursor(
          query.sort === "title"
            ? {
                sort: "title",
                order: query.order,
                titleNormalized: last.titleNormalized,
                id: last.id,
                filterFingerprint: publicMatchFilterFingerprint(query),
              }
            : {
                sort: "playedOn",
                order: query.order,
                playedOn: last.playedOn,
                startedAt: iso(last.startedAt),
                id: last.id,
                filterFingerprint: publicMatchFilterFingerprint(query),
              },
        )
      : null;
    return {
      items: visibleRows.map(publicSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      nextCursor,
    };
  }

  async getPublic(matchId: string): Promise<PublicMatchDetail | null> {
    const summaryRow = (
      await this.database
        .select({
          id: matchSeries.id,
          title: matchSeries.title,
          playedOn: matchSeries.playedOn,
          startedAt: matchSeries.startedAt,
          seasonId: seasons.id,
          seasonName: seasons.name,
          blueWins: matchSeries.blueWins,
          redWins: matchSeries.redWins,
          gameCount: matchSeries.gameCount,
        })
        .from(matchSeries)
        .innerJoin(seasons, eq(seasons.id, matchSeries.seasonId))
        .where(and(eq(matchSeries.id, matchId), eq(matchSeries.status, "PUBLISHED")))
        .limit(1)
    )[0];
    if (!summaryRow) return null;
    const gameRows = await this.database
      .select()
      .from(matchGames)
      .where(eq(matchGames.seriesId, matchId))
      .orderBy(asc(matchGames.gameNumber));
    const gameIds = gameRows.map((game) => game.id);
    const participantRows = gameIds.length
      ? await this.database
          .select({
            gameId: matchParticipants.gameId,
            playerId: matchParticipants.playerId,
            playerStatus: players.status,
            nickname: matchParticipants.nicknameSnapshot,
            tagLine: matchParticipants.tagLineSnapshot,
            championKey: matchParticipants.championKey,
            championName: championCatalog.displayName,
            championImageUrl: championCatalog.imageUrl,
            team: matchParticipants.team,
            position: matchParticipants.position,
            kills: matchParticipants.kills,
            deaths: matchParticipants.deaths,
            assists: matchParticipants.assists,
            mvpScoreUnits2: matchParticipants.mvpScoreUnits2,
          })
          .from(matchParticipants)
          .innerJoin(players, eq(players.id, matchParticipants.playerId))
          .leftJoin(championCatalog, eq(championCatalog.key, matchParticipants.championKey))
          .where(inArray(matchParticipants.gameId, gameIds))
      : [];
    const positionRank = new Map(MATCH_POSITIONS.map((position, index) => [position, index]));
    return {
      ...publicSummary(summaryRow),
      formulaVersion: MVP_FORMULA.version,
      games: gameRows.map((game) => ({
        gameNumber: game.gameNumber,
        durationSeconds: game.durationSeconds,
        winnerTeam: game.winnerTeam,
        mvpPlayerId: game.mvpPlayerId,
        participants: participantRows
          .filter((participant) => participant.gameId === game.id)
          .sort(
            (left, right) =>
              MATCH_TEAMS.indexOf(left.team) - MATCH_TEAMS.indexOf(right.team) ||
              (positionRank.get(left.position) ?? 99) - (positionRank.get(right.position) ?? 99),
          )
          .map((participant) => toPublicMatchPlayerDto({
            playerId: participant.playerId,
            profileAvailable: participant.playerStatus === "ACTIVE",
            nickname: participant.nickname,
            tagLine: participant.tagLine,
            championKey: participant.championKey,
            championName: participant.championName || participant.championKey,
            championImageUrl: participant.championImageUrl,
            team: participant.team,
            position: participant.position,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            mvpScore: participant.mvpScoreUnits2 / 2,
          })),
      })),
    };
  }

  async getPublicIdByLegacyId(legacyId: number) {
    return (
      await this.database
        .select({ id: matchSeries.id })
        .from(matchSeries)
        .where(and(eq(matchSeries.legacyId, legacyId), eq(matchSeries.status, "PUBLISHED")))
        .limit(1)
    )[0]?.id ?? null;
  }

  private async submissionImages(executor: DatabaseExecutor, submissionIds: readonly string[]) {
    if (submissionIds.length === 0) return [];
    return executor
      .select({
        id: matchSubmissionImages.id,
        submissionId: matchSubmissionImages.submissionId,
        gameNumber: matchSubmissionImages.gameNumber,
        contentType: privateAssets.contentType,
        byteSize: privateAssets.byteSize,
        sha256: privateAssets.sha256,
        assetStatus: privateAssets.status,
        ocrStatus: matchSubmissionImages.ocrStatus,
        ocrCandidate: matchSubmissionImages.ocrCandidateJson,
        ocrErrorCode: matchSubmissionImages.ocrErrorCode,
        revision: matchSubmissionImages.revision,
      })
      .from(matchSubmissionImages)
      .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
      .where(inArray(matchSubmissionImages.submissionId, [...submissionIds]))
      .orderBy(asc(matchSubmissionImages.gameNumber));
  }

  async listOwnSubmissions(actorUserAccountId: string, query: OwnSubmissionQuery) {
    const conditions = [
      eq(matchSubmissions.source, "WEB"),
      eq(matchSubmissions.ownerUserAccountId, actorUserAccountId),
    ];
    if (query.status) conditions.push(eq(matchSubmissions.status, query.status));
    if (query.cursor) {
      conditions.push(
        sql`(${matchSubmissions.updatedAt}, ${matchSubmissions.id}) < (${new Date(query.cursor.updatedAt)}, ${query.cursor.id}::uuid)`,
      );
    }
    const rows = await this.database
      .select({ submission: matchSubmissions, seasonName: seasons.name })
      .from(matchSubmissions)
      .leftJoin(seasons, eq(seasons.id, matchSubmissions.seasonId))
      .where(and(...conditions))
      .orderBy(desc(matchSubmissions.updatedAt), desc(matchSubmissions.id))
      .limit(query.pageSize + 1);
    const hasMore = rows.length > query.pageSize;
    const visible = rows.slice(0, query.pageSize);
    const images = await this.submissionImages(
      this.database,
      visible.map(({ submission }) => submission.id),
    );
    const items = visible.map(({ submission, seasonName }) =>
      ownSubmission(
        submission,
        seasonName,
        images.filter((image) => image.submissionId === submission.id).map((image) => image.gameNumber),
      ),
    );
    const last = visible.at(-1)?.submission;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeOwnSubmissionCursor({
              updatedAt: last.updatedAt.toISOString(),
              id: last.id,
              status: query.status ?? null,
            })
          : null,
    };
  }

  async getOwnSubmission(actorUserAccountId: string, submissionId: string) {
    const row = (
      await this.database
        .select({ submission: matchSubmissions, seasonName: seasons.name })
        .from(matchSubmissions)
        .leftJoin(seasons, eq(seasons.id, matchSubmissions.seasonId))
        .where(
          and(
            eq(matchSubmissions.id, submissionId),
            eq(matchSubmissions.source, "WEB"),
            eq(matchSubmissions.ownerUserAccountId, actorUserAccountId),
          ),
        )
        .limit(1)
    )[0];
    if (!row) return null;
    const images = await this.submissionImages(this.database, [submissionId]);
    return ownSubmission(row.submission, row.seasonName, images.map((image) => image.gameNumber));
  }

  async getOwnSubmissionByPublicCode(actorUserAccountId: string, publicCode: string) {
    const row = (
      await this.database
        .select({ submission: matchSubmissions, seasonName: seasons.name })
        .from(matchSubmissions)
        .leftJoin(seasons, eq(seasons.id, matchSubmissions.seasonId))
        .where(
          and(
            eq(matchSubmissions.publicCode, publicCode),
            eq(matchSubmissions.source, "WEB"),
            eq(matchSubmissions.ownerUserAccountId, actorUserAccountId),
          ),
        )
        .limit(1)
    )[0];
    if (!row) return null;
    const images = await this.submissionImages(this.database, [row.submission.id]);
    return ownSubmission(
      row.submission,
      row.seasonName,
      images.map((image) => image.gameNumber),
    );
  }

  private async adminSubmissionViews(rows: readonly { submission: SubmissionRow; seasonName: string | null }[]) {
    const images = await this.submissionImages(this.database, rows.map(({ submission }) => submission.id));
    return rows.map(({ submission, seasonName }): AdminSubmissionView => ({
      ...ownSubmission(
        submission,
        seasonName,
        images.filter((image) => image.submissionId === submission.id).map((image) => image.gameNumber),
      ),
      ownerUserAccountId: submission.ownerUserAccountId,
      reviewerUserAccountId: submission.reviewedByUserAccountId,
      reviewedAt: iso(submission.reviewedAt),
      reviewedResult: submission.reviewedResultJson,
      images: images
        .filter((image) => image.submissionId === submission.id)
        .map((image) => ({
          id: image.id,
          gameNumber: image.gameNumber,
          contentType: image.contentType,
          byteSize: image.byteSize,
          sha256: Buffer.from(image.sha256).toString("hex"),
          assetStatus: image.assetStatus,
          ocrStatus: image.ocrStatus,
          ocrCandidate: image.ocrCandidate,
          ocrErrorCode: image.ocrErrorCode,
          revision: image.revision,
        })),
    }));
  }

  async getAdminWorkspace(query: AdminMatchQuery): Promise<AdminMatchWorkspace> {
    if (query.view === "submissions") {
      const conditions = [];
      if (query.query) {
        conditions.push(
          or(
            literalContains(matchSubmissions.title, query.query),
            literalContains(matchSubmissions.organizer, query.query),
            literalContains(matchSubmissions.publicCode, query.query),
          )!,
        );
      }
      if (query.season === "UNASSIGNED") conditions.push(isNull(matchSubmissions.seasonId));
      else if (query.season) conditions.push(eq(matchSubmissions.seasonId, query.season));
      if (query.submissionStatus) conditions.push(eq(matchSubmissions.status, query.submissionStatus));
      const where = conditions.length ? and(...conditions) : undefined;
      const total = Number(
        (
          await this.database
            .select({ count: numericCount })
            .from(matchSubmissions)
            .where(where)
        )[0]?.count ?? 0,
      );
      const rows = await this.database
        .select({ submission: matchSubmissions, seasonName: seasons.name })
        .from(matchSubmissions)
        .leftJoin(seasons, eq(seasons.id, matchSubmissions.seasonId))
        .where(where)
        .orderBy(desc(matchSubmissions.updatedAt), desc(matchSubmissions.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return {
        matches: [],
        submissions: await this.adminSubmissionViews(rows),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
    }

    const conditions = [];
    if (query.query) {
      conditions.push(
        literalContains(matchSeries.titleNormalized, normalizedMatchIdentity(query.query)),
      );
    }
    if (query.season && query.season !== "UNASSIGNED") {
      conditions.push(eq(matchSeries.seasonId, query.season));
    }
    if (query.matchStatus) conditions.push(eq(matchSeries.status, query.matchStatus));
    const where = conditions.length ? and(...conditions) : undefined;
    const total = Number(
      (
        await this.database
          .select({ count: numericCount })
          .from(matchSeries)
          .where(where)
      )[0]?.count ?? 0,
    );
    const rows = await this.database
      .select({
        id: matchSeries.id,
        legacyId: matchSeries.legacyId,
        seasonId: matchSeries.seasonId,
        seasonName: seasons.name,
        teamBalanceDraftId: matchSeries.teamBalanceDraftId,
        title: matchSeries.title,
        playedOn: matchSeries.playedOn,
        startedAt: matchSeries.startedAt,
        startedAtOffsetMinutes: matchSeries.startedAtOffsetMinutes,
        status: matchSeries.status,
        voidReason: matchSeries.voidReason,
        revision: matchSeries.revision,
        blueWins: matchSeries.blueWins,
        redWins: matchSeries.redWins,
        gameCount: matchSeries.gameCount,
        updatedAt: matchSeries.updatedAt,
      })
      .from(matchSeries)
      .innerJoin(seasons, eq(seasons.id, matchSeries.seasonId))
      .where(where)
      .orderBy(desc(matchSeries.playedOn), desc(matchSeries.updatedAt), desc(matchSeries.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const matches: AdminMatchView[] = rows.map((row) => ({
      ...row,
      startedAt: iso(row.startedAt),
      gameCount: Number(row.gameCount),
      blueWins: Number(row.blueWins),
      redWins: Number(row.redWins),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return {
      matches,
      submissions: [],
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getAdminEditorCatalog(includePlayerIds: readonly string[] = []): Promise<AdminMatchEditorCatalog> {
    const [seasonRows, activePlayerRows, includedPlayerRows, championRows] = await Promise.all([
      this.database
        .select({ id: seasons.id, name: seasons.name, status: seasons.status })
        .from(seasons)
        .orderBy(asc(seasons.nameNormalized), asc(seasons.id)),
      this.database
        .select({
          id: players.id,
          nickname: players.nickname,
          tagLine: players.tagLine,
          status: players.status,
        })
        .from(players)
        .where(eq(players.status, "ACTIVE"))
        .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized), asc(players.id))
        .limit(40),
      includePlayerIds.length > 0
        ? this.database
            .select({
              id: players.id,
              nickname: players.nickname,
              tagLine: players.tagLine,
              status: players.status,
            })
            .from(players)
            .where(inArray(players.id, [...includePlayerIds]))
            .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized), asc(players.id))
        : Promise.resolve([]),
      this.database
        .select({
          key: championCatalog.key,
          displayName: championCatalog.displayName,
          status: championCatalog.status,
        })
        .from(championCatalog)
        .orderBy(asc(championCatalog.displayName), asc(championCatalog.key)),
    ]);
    const playerRows = [...activePlayerRows, ...includedPlayerRows]
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index);
    return { seasons: seasonRows, players: playerRows, champions: championRows };
  }

  async searchAdminPlayerOptions(query: string, includePlayerIds: readonly string[] = []) {
    const strategy = adminPlayerSearchStrategy(query);
    const searchPredicate = strategy.kind === "RIOT_ID_EXACT"
      ? and(eq(players.nicknameNormalized, strategy.nickname), eq(players.tagLineNormalized, strategy.tagLine))
      : or(
          like(players.nicknameNormalized, strategy.prefix),
          like(players.tagLineNormalized, strategy.prefix),
        );
    const [matched, included] = await Promise.all([
      this.database
        .select({
          id: players.id,
          nickname: players.nickname,
          tagLine: players.tagLine,
          status: players.status,
        })
        .from(players)
        .where(and(
          eq(players.status, "ACTIVE"),
          searchPredicate,
        ))
        .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized), asc(players.id))
        .limit(20),
      includePlayerIds.length > 0
        ? this.database
            .select({
              id: players.id,
              nickname: players.nickname,
              tagLine: players.tagLine,
              status: players.status,
            })
            .from(players)
            .where(inArray(players.id, [...includePlayerIds]))
            .limit(10)
        : Promise.resolve([]),
    ]);
    return [...included, ...matched]
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index)
      .slice(0, 30);
  }

  async getMatchSummaryIntegrity(after: string | null, pageSize: number): Promise<MatchSummaryIntegrity> {
    const batchRows = await this.database
      .select({ id: matchSeries.id })
      .from(matchSeries)
      .where(after ? gt(matchSeries.id, after) : undefined)
      .orderBy(asc(matchSeries.id))
      .limit(pageSize + 1);
    const hasMore = batchRows.length > pageSize;
    const batchIds = batchRows.slice(0, pageSize).map(({ id }) => id);
    if (batchIds.length === 0) {
      return { ok: true, checkedCount: 0, nextAfter: null, sampleTruncated: false, samples: [] };
    }
    const actual = this.database
      .select({
        matchId: matchGames.seriesId,
        gameCount: sql<number>`count(*)::int`.mapWith(Number).as("actual_game_count"),
        blueWins: sql<number>`count(*) filter (where ${matchGames.winnerTeam} = 'BLUE')::int`
          .mapWith(Number)
          .as("actual_blue_wins"),
        redWins: sql<number>`count(*) filter (where ${matchGames.winnerTeam} = 'RED')::int`
          .mapWith(Number)
          .as("actual_red_wins"),
      })
      .from(matchGames)
      .where(inArray(matchGames.seriesId, batchIds))
      .groupBy(matchGames.seriesId)
      .as("actual_match_result_summary");
    const actualGameCount = sql<number>`coalesce(${actual.gameCount}, 0)`.mapWith(Number);
    const actualBlueWins = sql<number>`coalesce(${actual.blueWins}, 0)`.mapWith(Number);
    const actualRedWins = sql<number>`coalesce(${actual.redWins}, 0)`.mapWith(Number);
    const rows = await this.database
      .select({
        matchId: matchSeries.id,
        storedGameCount: matchSeries.gameCount,
        storedBlueWins: matchSeries.blueWins,
        storedRedWins: matchSeries.redWins,
        actualGameCount,
        actualBlueWins,
        actualRedWins,
      })
      .from(matchSeries)
      .leftJoin(actual, eq(actual.matchId, matchSeries.id))
      .where(and(
        inArray(matchSeries.id, batchIds),
        or(
          ne(matchSeries.gameCount, actualGameCount),
          ne(matchSeries.blueWins, actualBlueWins),
          ne(matchSeries.redWins, actualRedWins),
        ),
      ))
      .orderBy(asc(matchSeries.id))
      .limit(101);
    return {
      ok: rows.length === 0,
      checkedCount: batchIds.length,
      nextAfter: hasMore ? batchIds.at(-1) ?? null : null,
      sampleTruncated: rows.length > 100,
      samples: rows.slice(0, 100).map((row) => ({
        matchId: row.matchId,
        stored: {
          gameCount: Number(row.storedGameCount),
          blueWins: Number(row.storedBlueWins),
          redWins: Number(row.storedRedWins),
        },
        actual: {
          gameCount: Number(row.actualGameCount),
          blueWins: Number(row.actualBlueWins),
          redWins: Number(row.actualRedWins),
        },
      })),
    };
  }

  private async loadStoredGames(executor: DatabaseExecutor, matchId: string): Promise<readonly MatchGameSnapshot[]> {
    const gameRows = await executor
      .select()
      .from(matchGames)
      .where(eq(matchGames.seriesId, matchId))
      .orderBy(asc(matchGames.gameNumber));
    if (gameRows.length === 0) return [];
    const participantRows = await executor
      .select()
      .from(matchParticipants)
      .where(inArray(matchParticipants.gameId, gameRows.map((game) => game.id)));
    return gameRows.map((game) => ({
      gameNumber: game.gameNumber,
      durationSeconds: game.durationSeconds,
      winnerTeam: game.winnerTeam,
      participants: participantRows
        .filter((participant) => participant.gameId === game.id)
        .sort(
          (left, right) =>
            MATCH_TEAMS.indexOf(left.team) - MATCH_TEAMS.indexOf(right.team) ||
            MATCH_POSITIONS.indexOf(left.position) - MATCH_POSITIONS.indexOf(right.position),
        )
        .map((participant) => ({
          playerId: participant.playerId,
          nicknameSnapshot: participant.nicknameSnapshot,
          tagLineSnapshot: participant.tagLineSnapshot,
          championKey: participant.championKey,
          team: participant.team,
          position: participant.position,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
        })),
    }));
  }

  async getAdminMatch(matchId: string) {
    const row = (
      await this.database
        .select({
          match: matchSeries,
          seasonName: seasons.name,
          blueWins: matchSeries.blueWins,
          redWins: matchSeries.redWins,
          gameCount: matchSeries.gameCount,
        })
        .from(matchSeries)
        .innerJoin(seasons, eq(seasons.id, matchSeries.seasonId))
        .where(eq(matchSeries.id, matchId))
        .limit(1)
    )[0];
    if (!row) return null;
    return {
      id: row.match.id,
      legacyId: row.match.legacyId,
      seasonId: row.match.seasonId,
      seasonName: row.seasonName,
      teamBalanceDraftId: row.match.teamBalanceDraftId,
      title: row.match.title,
      playedOn: row.match.playedOn,
      startedAt: iso(row.match.startedAt),
      startedAtOffsetMinutes: row.match.startedAtOffsetMinutes,
      status: row.match.status,
      voidReason: row.match.voidReason,
      revision: row.match.revision,
      gameCount: Number(row.gameCount),
      blueWins: Number(row.blueWins),
      redWins: Number(row.redWins),
      updatedAt: row.match.updatedAt.toISOString(),
      games: (await this.loadStoredGames(this.database, matchId)).map(toMatchGameInput),
    };
  }

  async getAdminSubmission(submissionId: string) {
    const row = (
      await this.database
        .select({ submission: matchSubmissions, seasonName: seasons.name })
        .from(matchSubmissions)
        .leftJoin(seasons, eq(seasons.id, matchSubmissions.seasonId))
        .where(eq(matchSubmissions.id, submissionId))
        .limit(1)
    )[0];
    if (!row) return null;
    return (await this.adminSubmissionViews([row]))[0] ?? null;
  }

  private async privateImageReference(
    submissionId: string,
    imageId: string,
    ownerUserAccountId?: string,
  ): Promise<PrivateImageReadReference | null> {
    const conditions = [
      eq(matchSubmissionImages.id, imageId),
      eq(matchSubmissionImages.submissionId, submissionId),
      eq(privateAssets.status, "READY"),
      ne(matchSubmissions.status, "CANCELLED"),
    ];
    if (ownerUserAccountId) {
      conditions.push(
        eq(matchSubmissions.source, "WEB"),
        eq(matchSubmissions.ownerUserAccountId, ownerUserAccountId),
      );
    }
    const row = (
      await this.database
        .select({
          storageProvider: privateAssets.storageProvider,
          storageKey: privateAssets.storageKey,
          contentType: privateAssets.contentType,
          byteSize: privateAssets.byteSize,
          sha256: privateAssets.sha256,
        })
        .from(matchSubmissionImages)
        .innerJoin(matchSubmissions, eq(matchSubmissions.id, matchSubmissionImages.submissionId))
        .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
        .where(and(...conditions))
        .limit(1)
    )[0];
    if (
      !row ||
      (row.contentType !== "image/png" &&
        row.contentType !== "image/jpeg" &&
        row.contentType !== "image/webp")
    ) {
      return null;
    }
    return { ...row, contentType: row.contentType };
  }

  getOwnPrivateImage(actorUserAccountId: string, submissionId: string, imageId: string) {
    return this.privateImageReference(submissionId, imageId, actorUserAccountId);
  }

  getAdminPrivateImage(submissionId: string, imageId: string) {
    return this.privateImageReference(submissionId, imageId);
  }

  private async assertAggregateReferences(
    transaction: V2Transaction,
    input: MatchRecordInput,
    previousGames: readonly MatchGameSnapshot[] = [],
  ): Promise<readonly MatchGameSnapshot[]> {
    const season = (
      await transaction
        .select({ id: seasons.id, status: seasons.status })
        .from(seasons)
        .where(eq(seasons.id, input.seasonId))
        .for("share")
        .limit(1)
    )[0];
    if (!season || season.status === "RETIRED") {
      throw new MatchServiceError("INVALID_INPUT", "사용 가능한 시즌을 선택해 주세요.");
    }
    const playerIds = [
      ...new Set(input.games.flatMap((game) => game.participants.map((participant) => participant.playerId))),
    ];
    const registered = await transaction
      .select({
        playerId: players.id,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(players)
      .where(inArray(players.id, playerIds))
      .for("share");
    if (registered.length !== playerIds.length) {
      throw new MatchServiceError("INVALID_INPUT", "등록되지 않은 플레이어가 포함되어 있습니다.");
    }
    const championKeys = [
      ...new Set(input.games.flatMap((game) => game.participants.map((participant) => participant.championKey))),
    ];
    const registeredChampions = await transaction
      .select({ key: championCatalog.key })
      .from(championCatalog)
      .where(
        and(
          inArray(championCatalog.key, championKeys),
          eq(championCatalog.status, "ACTIVE"),
        ),
      )
      .for("share");
    if (registeredChampions.length !== championKeys.length) {
      throw new MatchServiceError("INVALID_INPUT", "활성 챔피언 카탈로그에 없는 선택이 포함되어 있습니다.");
    }
    return captureMatchGameSnapshots(
      input.games,
      registered satisfies readonly MatchParticipantIdentity[],
      previousGames,
    );
  }

  private async insertGames(
    transaction: V2Transaction,
    seriesId: string,
    games: readonly MatchGameSnapshot[],
    now: Date,
  ) {
    for (const game of games) {
      const gameId = randomUUID();
      const mvp = selectGameMvp(game);
      await transaction.insert(matchGames).values({
        id: gameId,
        seriesId,
        gameNumber: game.gameNumber,
        durationSeconds: game.durationSeconds,
        winnerTeam: game.winnerTeam,
        mvpPlayerId: mvp.playerId,
        mvpScoreUnits2: mvp.scoreUnits2,
        mvpFormulaVersion: mvp.formulaVersion,
        mvpSelection: mvp.selection,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
      await transaction.insert(matchParticipants).values(
        game.participants.map((participant) => ({
          id: randomUUID(),
          gameId,
          playerId: participant.playerId,
          nicknameSnapshot: participant.nicknameSnapshot,
          tagLineSnapshot: participant.tagLineSnapshot,
          championKey: participant.championKey,
          team: participant.team,
          position: participant.position,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          mvpScoreUnits2: calculateMvpScoreUnits2(participant),
          mvpFormulaVersion: MVP_FORMULA.version,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  private async insertMatchAggregate(
    transaction: V2Transaction,
    envelope: MatchCommandEnvelope,
    input: MatchRecordInput,
    provenance: MatchSeriesProvenance,
    status: "DRAFT" | "PUBLISHED",
    now: Date,
  ) {
    const games = await this.assertAggregateReferences(transaction, input);
    const summary = resultSummary(input.games);
    const id = randomUUID();
    const row = (
      await transaction
        .insert(matchSeries)
        .values({
          id,
          legacyId: null,
          seasonId: input.seasonId,
          teamBalanceDraftId: provenance.teamBalanceDraftId,
          title: input.title,
          titleNormalized: normalizedMatchIdentity(input.title),
          playedOn: input.playedOn,
          startedAt: input.startedAt,
          startedAtOffsetMinutes: input.startedAtOffsetMinutes,
          blueWins: summary.blueWins,
          redWins: summary.redWins,
          gameCount: summary.gameCount,
          status,
          revision: 0,
          createdByUserAccountId: envelope.actor.userAccountId,
          updatedByUserAccountId: envelope.actor.userAccountId,
          publishedAt: status === "PUBLISHED" ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0];
    if (!row) throw new Error("MATCH_INSERT_FAILED");
    await this.insertGames(transaction, id, games, now);
    return { row, games };
  }

  private async assertPublishable(transaction: V2Transaction, matchId: string) {
    const gameRows = await transaction
      .select()
      .from(matchGames)
      .where(eq(matchGames.seriesId, matchId))
      .orderBy(asc(matchGames.gameNumber))
      .for("share");
    if (
      gameRows.length < 1 ||
      gameRows.length > 9 ||
      gameRows.some((game, index) => game.gameNumber !== index + 1)
    ) {
      throw new MatchServiceError("INVALID_TRANSITION", "게임 번호가 1부터 연속이어야 합니다.");
    }
    const participantRows = await transaction
      .select()
      .from(matchParticipants)
      .where(inArray(matchParticipants.gameId, gameRows.map((game) => game.id)))
      .for("share");
    const inputs: MatchGameSnapshot[] = [];
    for (const game of gameRows) {
      const rows = participantRows.filter((participant) => participant.gameId === game.id);
      if (rows.length !== 10) {
        throw new MatchServiceError("INVALID_TRANSITION", "각 게임은 정확히 10명의 참가자가 필요합니다.");
      }
      for (const team of MATCH_TEAMS) {
        const teamRows = rows.filter((participant) => participant.team === team);
        if (
          teamRows.length !== 5 ||
          new Set(teamRows.map((participant) => participant.position)).size !== 5 ||
          !MATCH_POSITIONS.every((position) => teamRows.some((participant) => participant.position === position))
        ) {
          throw new MatchServiceError(
            "INVALID_TRANSITION",
            "각 팀은 TOP/JGL/MID/ADC/SUP 한 명씩 정확히 5명이어야 합니다.",
          );
        }
      }
      const input: MatchGameSnapshot = {
        gameNumber: game.gameNumber,
        durationSeconds: game.durationSeconds,
        winnerTeam: game.winnerTeam,
        participants: rows.map((participant) => ({
          playerId: participant.playerId,
          nicknameSnapshot: participant.nicknameSnapshot,
          tagLineSnapshot: participant.tagLineSnapshot,
          championKey: participant.championKey,
          team: participant.team,
          position: participant.position,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
        })),
      };
      const mvp = selectGameMvp(input);
      if (
        rows.some(
          (participant) =>
            participant.mvpFormulaVersion !== MVP_FORMULA.version ||
            participant.mvpScoreUnits2 !== calculateMvpScoreUnits2(participant),
        ) ||
        game.mvpPlayerId !== mvp.playerId ||
        game.mvpScoreUnits2 !== mvp.scoreUnits2 ||
        game.mvpFormulaVersion !== MVP_FORMULA.version ||
        game.mvpSelection !== mvp.selection ||
        !rows.some(
          (participant) =>
            participant.playerId === game.mvpPlayerId && participant.team === game.winnerTeam,
        )
      ) {
        throw new MatchServiceError("INVALID_TRANSITION", "MVP 계산 또는 승리팀 연결이 올바르지 않습니다.");
      }
      inputs.push(input);
    }
    const series = (
      await transaction
        .select({
          blueWins: matchSeries.blueWins,
          redWins: matchSeries.redWins,
          gameCount: matchSeries.gameCount,
        })
        .from(matchSeries)
        .where(eq(matchSeries.id, matchId))
        .for("share")
        .limit(1)
    )[0];
    const summary = resultSummary(inputs);
    if (
      !series ||
      series.blueWins !== summary.blueWins ||
      series.redWins !== summary.redWins ||
      series.gameCount !== summary.gameCount
    ) {
      throw new MatchServiceError("INVALID_TRANSITION", "경기 승패 요약과 게임 원장이 일치하지 않습니다.");
    }
    return inputs;
  }

  private async assertAdminTeamBalanceSource(
    transaction: V2Transaction,
    input: MatchRecordInput,
    source: AdminMatchTeamBalanceSource | null,
  ): Promise<MatchSeriesProvenance> {
    if (!source) return EMPTY_MATCH_SERIES_PROVENANCE;
    const draft = (
      await transaction
        .select({
          id: teamBalanceDrafts.id,
          status: teamBalanceDrafts.status,
          revision: teamBalanceDrafts.revision,
          evaluationRound: teamBalanceDrafts.evaluationRound,
          selectedCandidateSource: teamBalanceDrafts.selectedCandidateSource,
          selectedCandidateSignature: teamBalanceDrafts.selectedCandidateSignature,
        })
        .from(teamBalanceDrafts)
        .where(eq(teamBalanceDrafts.id, source.teamBalanceDraftId))
        .for("share")
        .limit(1)
    )[0];
    if (!draft) throw new MatchServiceError("NOT_FOUND", "연결할 팀 초안을 찾을 수 없습니다.");
    if (
      draft.status === "ARCHIVED" ||
      draft.revision !== source.teamBalanceDraftRevision ||
      draft.evaluationRound !== source.teamBalanceEvaluationRound ||
      draft.selectedCandidateSignature !== source.teamBalanceCandidateSignature ||
      !draft.selectedCandidateSource
    ) {
      throw new MatchServiceError("PRECONDITION_FAILED", "팀 초안 또는 선택 후보가 변경되었습니다. 최신 배치를 다시 불러와 주세요.");
    }
    const [candidate, participantRows] = await Promise.all([
      transaction
        .select({ assignmentsJson: teamBalanceDraftCandidates.assignmentsJson })
        .from(teamBalanceDraftCandidates)
        .where(and(
          eq(teamBalanceDraftCandidates.draftId, draft.id),
          eq(teamBalanceDraftCandidates.evaluationRound, draft.evaluationRound),
          eq(teamBalanceDraftCandidates.source, draft.selectedCandidateSource),
          eq(teamBalanceDraftCandidates.signature, draft.selectedCandidateSignature),
        ))
        .for("share")
        .limit(1),
      transaction
        .select({ playerId: teamBalanceDraftParticipants.playerId })
        .from(teamBalanceDraftParticipants)
        .where(eq(teamBalanceDraftParticipants.draftId, draft.id))
        .for("share"),
    ]);
    if (!candidate[0] || !validTeamBalanceSubmissionAssignments(
      candidate[0].assignmentsJson,
      participantRows.map((row) => row.playerId),
    )) {
      throw new MatchServiceError("INVALID_TRANSITION", "선택한 팀 후보의 참가자 구성이 손상되었습니다.");
    }
    const selectedAssignments = new Set(
      (candidate[0].assignmentsJson as readonly Record<string, unknown>[])
        .map((assignment) => `${assignment.playerId}:${assignment.team}:${assignment.position}`),
    );
    const firstGameAssignments = new Set(
      input.games[0]?.participants.map((participant) =>
        `${participant.playerId}:${participant.team}:${participant.position}`) ?? [],
    );
    if (
      selectedAssignments.size !== 10 ||
      firstGameAssignments.size !== 10 ||
      [...selectedAssignments].some((assignment) => !firstGameAssignments.has(assignment))
    ) {
      throw new MatchServiceError("INVALID_INPUT", "경기 1세트의 팀·포지션 배치가 선택한 팀 초안과 다릅니다.");
    }
    return { teamBalanceDraftId: draft.id };
  }

  async createMatch(
    envelope: MatchCommandEnvelope,
    input: MatchRecordInput,
    now: Date,
    teamBalanceSource: AdminMatchTeamBalanceSource | null = null,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const provenance = await this.assertAdminTeamBalanceSource(transaction, input, teamBalanceSource);
      const created = await this.insertMatchAggregate(
        transaction,
        envelope,
        input,
        provenance,
        "DRAFT",
        now,
      );
      const after = matchSnapshot(created.row, created.games);
      await this.audit(transaction, envelope, "MATCH_CREATED", "MATCH_SERIES", created.row.id, null, after,
        teamBalanceSource ? { teamBalanceSource } : undefined);
      await this.outbox(transaction, created.row, "CREATED", null, null, null, null, after, now);
      return {
        body: { id: created.row.id, status: created.row.status, revision: created.row.revision },
        status: 201,
        revision: created.row.revision,
      };
    });
  }

  async updateMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    input: MatchRecordInput,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSeries)
          .where(eq(matchSeries.id, matchId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "경기를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "경기가 다른 요청에서 변경되었습니다.");
      }
      if (current.status === "VOIDED") {
        throw new MatchServiceError("INVALID_TRANSITION", "무효화된 경기는 먼저 복구해야 합니다.");
      }
      const beforeGames = await this.loadStoredGames(transaction, matchId);
      const before = matchSnapshot(current, beforeGames);
      const games = await this.assertAggregateReferences(transaction, input, beforeGames);
      await transaction.insert(matchAggregateVersions).values({
        id: randomUUID(),
        matchSeriesId: matchId,
        revision: current.revision,
        snapshotJson: before,
        inputDigest: digest(before),
        archivedByUserAccountId: envelope.actor.userAccountId,
        archivedAt: now,
      });
      const gameIds = (
        await transaction
          .select({ id: matchGames.id })
          .from(matchGames)
          .where(eq(matchGames.seriesId, matchId))
          .for("update")
      ).map((game) => game.id);
      if (gameIds.length) {
        await transaction.delete(matchParticipants).where(inArray(matchParticipants.gameId, gameIds));
        await transaction.delete(matchGames).where(inArray(matchGames.id, gameIds));
      }
      await this.insertGames(transaction, matchId, games, now);
      const summary = resultSummary(input.games);
      const updated = (
        await transaction
          .update(matchSeries)
          .set({
            seasonId: input.seasonId,
            title: input.title,
            titleNormalized: normalizedMatchIdentity(input.title),
            playedOn: input.playedOn,
            startedAt: input.startedAt,
            startedAtOffsetMinutes: input.startedAtOffsetMinutes,
            blueWins: summary.blueWins,
            redWins: summary.redWins,
            gameCount: summary.gameCount,
            revision: current.revision + 1,
            updatedByUserAccountId: envelope.actor.userAccountId,
            updatedAt: now,
          })
          .where(and(eq(matchSeries.id, matchId), eq(matchSeries.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "경기가 변경되었습니다.");
      if (current.status === "PUBLISHED") await this.assertPublishable(transaction, matchId);
      const after = matchSnapshot(updated, games);
      await this.audit(transaction, envelope, "MATCH_AMENDED", "MATCH_SERIES", matchId, before, after);
      await this.outbox(
        transaction,
        updated,
        "AMENDED",
        current.status === "PUBLISHED" ? orderKey(current) : null,
        updated.status === "PUBLISHED" ? orderKey(updated) : null,
        current.status === "PUBLISHED" ? current.seasonId : null,
        updated.status === "PUBLISHED" ? updated.seasonId : null,
        after,
        now,
      );
      return {
        body: { id: matchId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async publishMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSeries)
          .where(eq(matchSeries.id, matchId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "경기를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "경기가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "DRAFT") {
        throw new MatchServiceError("INVALID_TRANSITION", "초안 경기만 공개할 수 있습니다.");
      }
      const games = await this.assertPublishable(transaction, matchId);
      await this.assertAggregateReferences(transaction, {
        seasonId: current.seasonId,
        title: current.title,
        playedOn: current.playedOn,
        startedAt: current.startedAt,
        startedAtOffsetMinutes: current.startedAtOffsetMinutes,
        games,
      });
      const before = matchSnapshot(current, games);
      const updated = (
        await transaction
          .update(matchSeries)
          .set({
            status: "PUBLISHED",
            publishedAt: now,
            revision: current.revision + 1,
            updatedByUserAccountId: envelope.actor.userAccountId,
            updatedAt: now,
          })
          .where(and(eq(matchSeries.id, matchId), eq(matchSeries.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "경기가 변경되었습니다.");
      const after = matchSnapshot(updated, games);
      await this.audit(transaction, envelope, "MATCH_PUBLISHED", "MATCH_SERIES", matchId, before, after);
      await this.outbox(
        transaction,
        updated,
        "PUBLISHED",
        null,
        orderKey(updated),
        null,
        updated.seasonId,
        after,
        now,
      );
      return {
        body: { id: matchId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async voidMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    reason: string,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSeries)
          .where(eq(matchSeries.id, matchId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "경기를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "경기가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "PUBLISHED") {
        throw new MatchServiceError("INVALID_TRANSITION", "공개 경기만 무효화할 수 있습니다.");
      }
      const games = await this.assertPublishable(transaction, matchId);
      const before = matchSnapshot(current, games);
      const updated = (
        await transaction
          .update(matchSeries)
          .set({
            status: "VOIDED",
            voidReason: reason,
            voidedAt: now,
            revision: current.revision + 1,
            updatedByUserAccountId: envelope.actor.userAccountId,
            updatedAt: now,
          })
          .where(and(eq(matchSeries.id, matchId), eq(matchSeries.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "경기가 변경되었습니다.");
      const after = matchSnapshot(updated, games);
      await this.audit(transaction, envelope, "MATCH_VOIDED", "MATCH_SERIES", matchId, before, after);
      await this.outbox(
        transaction,
        updated,
        "VOIDED",
        orderKey(current),
        null,
        current.seasonId,
        null,
        after,
        now,
      );
      return {
        body: { id: matchId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async restoreMatch(
    envelope: MatchCommandEnvelope,
    matchId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSeries)
          .where(eq(matchSeries.id, matchId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "경기를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "경기가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "VOIDED") {
        throw new MatchServiceError("INVALID_TRANSITION", "무효화된 경기만 복구할 수 있습니다.");
      }
      const games = await this.assertPublishable(transaction, matchId);
      await this.assertAggregateReferences(transaction, {
        seasonId: current.seasonId,
        title: current.title,
        playedOn: current.playedOn,
        startedAt: current.startedAt,
        startedAtOffsetMinutes: current.startedAtOffsetMinutes,
        games,
      });
      const before = matchSnapshot(current, games);
      const updated = (
        await transaction
          .update(matchSeries)
          .set({
            status: "PUBLISHED",
            voidReason: null,
            voidedAt: null,
            revision: current.revision + 1,
            updatedByUserAccountId: envelope.actor.userAccountId,
            updatedAt: now,
          })
          .where(and(eq(matchSeries.id, matchId), eq(matchSeries.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "경기가 변경되었습니다.");
      const after = matchSnapshot(updated, games);
      await this.audit(transaction, envelope, "MATCH_RESTORED", "MATCH_SERIES", matchId, before, after);
      await this.outbox(
        transaction,
        updated,
        "RESTORED",
        null,
        orderKey(updated),
        null,
        updated.seasonId,
        after,
        now,
      );
      return {
        body: { id: matchId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  private async assertSubmissionSeason(transaction: V2Transaction, seasonId: string | null) {
    if (!seasonId) return;
    const row = (
      await transaction
        .select({ id: seasons.id, status: seasons.status })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .for("share")
        .limit(1)
    )[0];
    if (!row || row.status === "RETIRED") {
      throw new MatchServiceError("INVALID_INPUT", "사용 가능한 시즌을 선택해 주세요.");
    }
  }

  private async assertSubmissionTeamBalanceDraft(
    transaction: V2Transaction,
    draftId: string | null,
    ownerUserAccountId: string | null,
  ) {
    if (!draftId) return;
    if (!ownerUserAccountId) {
      throw new MatchServiceError("INVALID_TRANSITION", "소유자가 없는 접수에는 팀 초안을 연결할 수 없습니다.");
    }
    const draft = (
      await transaction
        .select({
          id: teamBalanceDrafts.id,
          evaluationRound: teamBalanceDrafts.evaluationRound,
          selectedCandidateSource: teamBalanceDrafts.selectedCandidateSource,
          selectedCandidateSignature: teamBalanceDrafts.selectedCandidateSignature,
        })
        .from(teamBalanceDrafts)
        .where(and(
          eq(teamBalanceDrafts.id, draftId),
          eq(teamBalanceDrafts.ownerUserAccountId, ownerUserAccountId),
          inArray(teamBalanceDrafts.status, ["EVALUATED", "SAVED"]),
        ))
        .for("share")
        .limit(1)
    )[0];
    if (!draft) {
      throw new MatchServiceError("NOT_FOUND", "연결할 수 있는 본인 팀 초안을 찾을 수 없습니다.");
    }
    if (!draft.selectedCandidateSource || !draft.selectedCandidateSignature) {
      throw new MatchServiceError("INVALID_TRANSITION", "팀 후보를 선택한 초안만 경기 접수에 연결할 수 있습니다.");
    }
    const [candidate, participantRows] = await Promise.all([
      transaction
        .select({ assignmentsJson: teamBalanceDraftCandidates.assignmentsJson })
        .from(teamBalanceDraftCandidates)
        .where(and(
          eq(teamBalanceDraftCandidates.draftId, draft.id),
          eq(teamBalanceDraftCandidates.evaluationRound, draft.evaluationRound),
          eq(teamBalanceDraftCandidates.source, draft.selectedCandidateSource),
          eq(teamBalanceDraftCandidates.signature, draft.selectedCandidateSignature),
        ))
        .for("share")
        .limit(1),
      transaction
        .select({ playerId: teamBalanceDraftParticipants.playerId })
        .from(teamBalanceDraftParticipants)
        .where(eq(teamBalanceDraftParticipants.draftId, draft.id))
        .for("share"),
    ]);
    if (!candidate[0] || !validTeamBalanceSubmissionAssignments(
      candidate[0].assignmentsJson,
      participantRows.map((row) => row.playerId),
    )) {
      throw new MatchServiceError("INVALID_TRANSITION", "선택한 팀 후보와 참가자 구성이 일치하지 않습니다.");
    }
  }

  async createSubmission(
    envelope: MatchCommandEnvelope,
    input: MatchSubmissionCreateInput,
    sourceReferenceHash: Buffer,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      await this.assertSubmissionSeason(transaction, input.seasonId);
      await this.assertSubmissionTeamBalanceDraft(
        transaction,
        input.teamBalanceDraftId,
        envelope.actor.userAccountId,
      );
      const id = randomUUID();
      const publicCode = `MR2${randomBytes(8).toString("hex").toUpperCase()}`;
      const row = (
        await transaction
          .insert(matchSubmissions)
          .values({
            id,
            publicCode,
            ownerUserAccountId: envelope.actor.userAccountId,
            seasonId: input.seasonId,
            title: input.title,
            organizer: input.organizer,
            seriesNumber: input.seriesNumber,
            note: input.note,
            playedOn: input.playedOn,
            startedAt: input.startedAt,
            startedAtOffsetMinutes: input.startedAtOffsetMinutes,
            expectedGameCount: input.expectedGameCount,
            teamBalanceDraftId: input.teamBalanceDraftId,
            source: "WEB",
            sourceReferenceHash,
            provenanceJson: { source: "WEB", contractVersion: 1 },
            status: "AWAITING_UPLOAD",
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0];
      if (!row) throw new Error("SUBMISSION_INSERT_FAILED");
      const after = submissionSnapshot(row);
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_CREATED",
        "MATCH_SUBMISSION",
        id,
        null,
        after,
        { source: "WEB" },
      );
      return {
        body: {
          submissionId: id,
          publicCode,
          status: row.status,
          revision: row.revision,
        },
        status: 201,
        revision: row.revision,
      };
    });
  }

  async createAdminImport(
    envelope: MatchCommandEnvelope,
    input: AdminMatchImportInput,
    sourceReferenceHash: Buffer,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      if (envelope.actor.purpose !== "ADMIN") {
        throw new MatchServiceError("FORBIDDEN", "관리자 가져오기 권한이 없습니다.");
      }
      await this.assertSubmissionSeason(transaction, input.seasonId);
      const id = randomUUID();
      const publicCode = `AI2${randomBytes(8).toString("hex").toUpperCase()}`;
      const row = (
        await transaction
          .insert(matchSubmissions)
          .values({
            id,
            publicCode,
            ownerUserAccountId: null,
            seasonId: input.seasonId,
            title: input.title,
            organizer: "관리자 직접 가져오기",
            seriesNumber: 1,
            note: "관리자 캡처 직접 가져오기 — 비공개 검토 전용",
            playedOn: input.playedOn,
            startedAt: input.startedAt,
            startedAtOffsetMinutes: input.startedAtOffsetMinutes,
            expectedGameCount: 1,
            teamBalanceDraftId: null,
            source: "ADMIN",
            sourceReferenceHash,
            provenanceJson: { source: "ADMIN", contractVersion: 1, reviewFirst: true },
            status: "AWAITING_UPLOAD",
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0];
      if (!row) throw new Error("ADMIN_MATCH_IMPORT_INSERT_FAILED");
      await this.audit(
        transaction,
        envelope,
        "ADMIN_MATCH_IMPORT_CREATED",
        "MATCH_SUBMISSION",
        id,
        null,
        submissionSnapshot(row),
        { source: "ADMIN", reviewFirst: true },
      );
      return {
        body: { submissionId: id, publicCode, status: row.status, revision: row.revision },
        status: 201,
        revision: row.revision,
      };
    });
  }

  async updateSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    input: MatchSubmissionUpdateInput,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, submissionId))
          .for("update")
          .limit(1)
      )[0];
      const authorized = current && (
        (envelope.actor.purpose === "ACCOUNT" &&
          current.source === "WEB" &&
          current.ownerUserAccountId === envelope.actor.userAccountId) ||
        (envelope.actor.purpose === "ADMIN" && current.source === "ADMIN")
      );
      if (!authorized) {
        throw new MatchServiceError("NOT_FOUND", "수정할 접수를 찾을 수 없습니다.");
      }
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "AWAITING_UPLOAD") {
        throw new MatchServiceError("INVALID_TRANSITION", "이미지 검토 대기 전 접수만 수정할 수 있습니다.");
      }
      await this.assertSubmissionSeason(transaction, input.seasonId);
      if (input.teamBalanceDraftId !== current.teamBalanceDraftId) {
        throw new MatchServiceError("INVALID_TRANSITION", "접수 생성 뒤에는 연결한 팀 초안을 변경할 수 없습니다.");
      }
      await this.assertSubmissionTeamBalanceDraft(
        transaction,
        current.teamBalanceDraftId,
        current.ownerUserAccountId,
      );
      const imageNumbers = (
        await transaction
          .select({ gameNumber: matchSubmissionImages.gameNumber })
          .from(matchSubmissionImages)
          .where(eq(matchSubmissionImages.submissionId, submissionId))
          .for("share")
      ).map((image) => image.gameNumber);
      if (
        imageNumbers.length > 0 &&
        input.expectedGameCount !== current.expectedGameCount
      ) {
        throw new MatchServiceError(
          "INVALID_TRANSITION",
          "이미지를 한 장이라도 등록한 뒤에는 예상 게임 수를 변경할 수 없습니다.",
        );
      }
      if (imageNumbers.some((gameNumber) => gameNumber > input.expectedGameCount)) {
        throw new MatchServiceError("INVALID_TRANSITION", "등록된 이미지보다 게임 수를 줄일 수 없습니다.");
      }
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            seasonId: input.seasonId,
            title: input.title,
            organizer: input.organizer,
            seriesNumber: input.seriesNumber,
            note: input.note,
            playedOn: input.playedOn,
            startedAt: input.startedAt,
            startedAtOffsetMinutes: input.startedAtOffsetMinutes,
            expectedGameCount: input.expectedGameCount,
            teamBalanceDraftId: input.teamBalanceDraftId,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, submissionId),
              eq(matchSubmissions.revision, expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_UPDATED",
        "MATCH_SUBMISSION",
        submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
      );
      return {
        body: { submissionId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async cancelSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, submissionId))
          .for("update")
          .limit(1)
      )[0];
      const authorized = current && (
        (envelope.actor.purpose === "ACCOUNT" &&
          current.source === "WEB" &&
          current.ownerUserAccountId === envelope.actor.userAccountId) ||
        (envelope.actor.purpose === "ADMIN" && current.source === "ADMIN")
      );
      if (!authorized) {
        throw new MatchServiceError("NOT_FOUND", "취소할 접수를 찾을 수 없습니다.");
      }
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "AWAITING_UPLOAD" && current.status !== "PENDING_REVIEW") {
        throw new MatchServiceError("INVALID_TRANSITION", "승인 또는 거절된 접수는 취소할 수 없습니다.");
      }
      const assetRows = (
        await transaction
          .select({ id: privateAssets.id, status: privateAssets.status })
          .from(matchSubmissionImages)
          .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
          .where(eq(matchSubmissionImages.submissionId, submissionId))
          .for("update")
      );
      const assetIds = assetRows.map(({ id }) => id);
      if (assetIds.length > 0) {
        await transaction
          .update(privateAssets)
          .set({ status: "DELETE_PENDING", deleteRequestedAt: now })
          .where(and(inArray(privateAssets.id, assetIds), inArray(privateAssets.status, ["STAGED", "READY"])));
        const pendingCount = Number((
          await transaction
            .select({ value: numericCount })
            .from(privateAssets)
            .where(and(inArray(privateAssets.id, assetIds), eq(privateAssets.status, "DELETE_PENDING")))
        )[0]?.value ?? 0);
        if (pendingCount !== assetIds.length) {
          throw new MatchServiceError("PRECONDITION_FAILED", "비공개 이미지 정리 예약 경합을 감지했습니다.");
        }
      }
      const pendingReservations = await transaction
        .update(matchUploadReservations)
        .set({
          status: "DELETE_PENDING",
          deleteRequestedAt: now,
          deleteFailureCode: "SUBMISSION_CANCELLED",
          updatedAt: now,
        })
        .where(
          and(
            eq(matchUploadReservations.submissionId, submissionId),
            inArray(matchUploadReservations.status, ["RESERVED", "STAGED", "FINALIZED", "DELETE_PENDING"]),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            status: "CANCELLED",
            reviewedResultJson: null,
            cancelledAt: now,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, submissionId),
              eq(matchSubmissions.revision, expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_CANCELLED",
        "MATCH_SUBMISSION",
        submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
        { cleanupAssetCount: assetIds.length, cleanupReservationCount: pendingReservations.length },
      );
      return {
        body: { submissionId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  private async consumeUploadRateLimits(
    transaction: V2Transaction,
    input: PrivateImageUploadReservationInput,
    now: Date,
  ) {
    const windowMs = 10 * 60 * 1_000;
    const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const expiresAt = new Date(windowStartedAt.getTime() + windowMs + 15 * 60 * 1_000);
    const policies = [
      { keyHash: input.accountRateLimitKeyHash, limit: 12 },
      { keyHash: input.networkRateLimitKeyHash, limit: 40 },
    ] as const;
    let blocked = false;
    for (const policy of policies) {
          const previousBlock = (
            await transaction
              .select({ blockedUntil: matchRateLimitBuckets.blockedUntil })
              .from(matchRateLimitBuckets)
              .where(
                and(
                  eq(matchRateLimitBuckets.scope, "IMAGE_UPLOAD"),
                  eq(matchRateLimitBuckets.keyHash, policy.keyHash),
                  gt(matchRateLimitBuckets.blockedUntil, now),
                ),
              )
              .orderBy(desc(matchRateLimitBuckets.updatedAt))
              .for("update")
              .limit(1)
          )[0];
          const row = (
            await transaction
              .insert(matchRateLimitBuckets)
              .values({
                scope: "IMAGE_UPLOAD",
                keyHash: policy.keyHash,
                windowStartedAt,
                attemptCount: 1,
                expiresAt,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [
                  matchRateLimitBuckets.scope,
                  matchRateLimitBuckets.keyHash,
                  matchRateLimitBuckets.windowStartedAt,
                ],
                set: {
                  attemptCount: sql`${matchRateLimitBuckets.attemptCount} + 1`,
                  expiresAt,
                  updatedAt: now,
                },
              })
              .returning({
                attemptCount: matchRateLimitBuckets.attemptCount,
                blockedUntil: matchRateLimitBuckets.blockedUntil,
              })
          )[0];
          if (!row) throw new Error("MATCH_UPLOAD_RATE_BUCKET_FAILED");
          const exceeded = row.attemptCount > policy.limit;
          if (previousBlock || (row.blockedUntil && row.blockedUntil > now) || exceeded) {
            blocked = true;
          }
          if (exceeded && (!row.blockedUntil || row.blockedUntil <= now)) {
            await transaction
              .update(matchRateLimitBuckets)
              .set({ blockedUntil: new Date(now.getTime() + 15 * 60 * 1_000), updatedAt: now })
              .where(
                and(
                  eq(matchRateLimitBuckets.scope, "IMAGE_UPLOAD"),
                  eq(matchRateLimitBuckets.keyHash, policy.keyHash),
                  eq(matchRateLimitBuckets.windowStartedAt, windowStartedAt),
                ),
              );
          }
    }
    return blocked;
  }

  async reservePrivateImageUpload(
    envelope: MatchCommandEnvelope,
    input: PrivateImageUploadReservationInput,
    now: Date,
  ): Promise<PrivateImageUploadReservationResult> {
    try {
      const result = await withTransaction(this.database, async (transaction) => {
        await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
        const lockMaterial = JSON.stringify([
          "klol-v2-match-upload-preflight-lock-v1",
          envelope.actor.userAccountId,
          envelope.scope,
          envelope.keyHash.toString("hex"),
        ]);
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lockMaterial}, 0))`,
        );
        const freshNow = await databaseClock(transaction);
        await transaction
          .delete(matchCommandReceipts)
          .where(
            and(
              eq(matchCommandReceipts.actorUserAccountId, envelope.actor.userAccountId),
              eq(matchCommandReceipts.scope, envelope.scope),
              eq(matchCommandReceipts.keyHash, envelope.keyHash),
              lte(matchCommandReceipts.expiresAt, freshNow),
            ),
          );
        const replay = await receipt(transaction, envelope, freshNow);
        if (replay) return { kind: "REPLAY" as const, result: replay };

        const current = (
          await transaction
            .select()
            .from(matchSubmissions)
            .where(eq(matchSubmissions.id, input.submissionId))
            .for("update")
            .limit(1)
        )[0];
        const authorizedSubmission = current && (
          (envelope.actor.purpose === "ACCOUNT" &&
            current.source === "WEB" &&
            current.ownerUserAccountId === envelope.actor.userAccountId) ||
          (envelope.actor.purpose === "ADMIN" && current.source === "ADMIN")
        );
        if (!authorizedSubmission) {
          throw new MatchServiceError("NOT_FOUND", "업로드할 접수를 찾을 수 없습니다.");
        }

        await transaction
          .update(matchUploadReservations)
          .set({
            status: "DELETE_PENDING",
            deleteRequestedAt: freshNow,
            deleteFailureCode: "RESERVATION_EXPIRED",
            updatedAt: freshNow,
          })
          .where(
            and(
              eq(matchUploadReservations.submissionId, input.submissionId),
              eq(matchUploadReservations.gameNumber, input.gameNumber),
              inArray(matchUploadReservations.status, ["RESERVED", "STAGED"]),
              lte(matchUploadReservations.expiresAt, sql<Date>`clock_timestamp()`),
            ),
          );

        const existing = (
          await transaction
            .select()
            .from(matchUploadReservations)
            .where(
              and(
                eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
                eq(matchUploadReservations.scope, envelope.scope),
                eq(matchUploadReservations.keyHash, envelope.keyHash),
                inArray(matchUploadReservations.status, ["RESERVED", "STAGED"]),
              ),
            )
            .for("update")
            .limit(1)
        )[0];
        if (existing) {
          if (!Buffer.from(existing.requestHash).equals(envelope.requestHash)) {
            throw new MatchServiceError(
              "IDEMPOTENCY_MISMATCH",
              "같은 멱등성 키가 다른 업로드 조건에 사용되었습니다.",
            );
          }
          return {
            kind: "RESERVED" as const,
            reservationId: existing.id,
            expiresAt: existing.expiresAt.toISOString(),
            storageProvider: existing.storageProvider,
            storageKey: existing.storageKey,
          };
        }
        const prior = (
          await transaction
            .select()
            .from(matchUploadReservations)
            .where(
              and(
                eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
                eq(matchUploadReservations.scope, envelope.scope),
                eq(matchUploadReservations.keyHash, envelope.keyHash),
              ),
            )
            .orderBy(desc(matchUploadReservations.createdAt))
            .for("update")
            .limit(1)
        )[0];
        if (prior && !Buffer.from(prior.requestHash).equals(envelope.requestHash)) {
          throw new MatchServiceError(
            "IDEMPOTENCY_MISMATCH",
            "같은 멱등성 키가 다른 업로드 조건에 사용되었습니다.",
          );
        }
        if (prior?.status === "DELETE_PENDING") {
          throw new MatchServiceError(
            "INVALID_TRANSITION",
            "이전 저장 객체 정리가 끝나지 않았습니다. 새 멱등성 키로 다시 시도해 주세요.",
          );
        }
        if (prior?.status === "FINALIZED") {
          throw new MatchServiceError("DUPLICATE", "이미 최종화된 이미지 업로드입니다.");
        }
        if (current.revision !== input.expectedRevision) {
          throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
        }
        if (current.status !== "AWAITING_UPLOAD") {
          throw new MatchServiceError("INVALID_TRANSITION", "현재 접수에는 이미지를 추가할 수 없습니다.");
        }
        if (input.gameNumber < 1 || input.gameNumber > current.expectedGameCount) {
          throw new MatchServiceError("INVALID_INPUT", "게임 번호가 접수 범위를 벗어났습니다.");
        }
        const existingImages = await transaction
          .select({ gameNumber: matchSubmissionImages.gameNumber, sha256: privateAssets.sha256 })
          .from(matchSubmissionImages)
          .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
          .where(eq(matchSubmissionImages.submissionId, input.submissionId))
          .for("share");
        if (
          existingImages.some((image) => image.gameNumber === input.gameNumber) ||
          existingImages.some((image) => Buffer.from(image.sha256).equals(input.declaredSha256))
        ) {
          throw new MatchServiceError("DUPLICATE", "같은 게임 번호 또는 이미지가 이미 등록되었습니다.");
        }
        if (existingImages.length >= current.expectedGameCount) {
          throw new MatchServiceError("IMAGE_LIMIT", "필요한 이미지가 모두 등록되었습니다.");
        }
        if (await this.consumeUploadRateLimits(transaction, input, freshNow)) {
          return { kind: "BLOCKED" as const };
        }
        const reservationId = randomUUID();
        const expiresAt = new Date(freshNow.getTime() + MATCH_UPLOAD_RESERVATION_TTL_MS);
        if (prior?.status === "CANCELLED") {
          const reactivated = await transaction
            .update(matchUploadReservations)
            .set({
              submissionId: input.submissionId,
              requestHash: envelope.requestHash,
              gameNumber: input.gameNumber,
              expectedRevision: input.expectedRevision,
              declaredContentType: input.declaredContentType,
              declaredByteSize: input.declaredByteSize,
              declaredSha256: input.declaredSha256,
              storageProvider: input.storageProvider,
              storageKey: input.storageKey,
              status: "RESERVED",
              expiresAt,
              stagedAt: null,
              finalizedAt: null,
              deleteRequestedAt: null,
              deleteFailureCode: null,
              storageDeletedAt: null,
              cancelledAt: null,
              updatedAt: freshNow,
            })
            .where(
              and(
                eq(matchUploadReservations.id, prior.id),
                eq(matchUploadReservations.status, "CANCELLED"),
              ),
            )
            .returning({ id: matchUploadReservations.id });
          if (reactivated.length !== 1) {
            throw new MatchServiceError("PRECONDITION_FAILED", "취소된 업로드 예약 재사용 경합을 감지했습니다.");
          }
        } else {
          await transaction.insert(matchUploadReservations).values({
            id: reservationId,
            actorUserAccountId: envelope.actor.userAccountId,
            submissionId: input.submissionId,
            scope: envelope.scope,
            keyHash: envelope.keyHash,
            requestHash: envelope.requestHash,
            gameNumber: input.gameNumber,
            expectedRevision: input.expectedRevision,
            declaredContentType: input.declaredContentType,
            declaredByteSize: input.declaredByteSize,
            declaredSha256: input.declaredSha256,
            storageProvider: input.storageProvider,
            storageKey: input.storageKey,
            status: "RESERVED",
            expiresAt,
            createdAt: freshNow,
            updatedAt: freshNow,
          });
        }
        return {
          kind: "RESERVED" as const,
          reservationId: prior?.status === "CANCELLED" ? prior.id : reservationId,
          expiresAt: expiresAt.toISOString(),
          storageProvider: input.storageProvider,
          storageKey: input.storageKey,
        };
      });
      if (result.kind === "BLOCKED") {
        throw new MatchServiceError(
          "RATE_LIMITED",
          "이미지 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      return result;
    } catch (error) {
      translateConstraint(error);
    }
  }

  async cancelPrivateImageUpload(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ) {
    await withTransaction(this.database, async (transaction) => {
      await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
      const updated = await transaction
        .update(matchUploadReservations)
        .set({ status: "CANCELLED", cancelledAt: now, updatedAt: now })
        .where(
          and(
            eq(matchUploadReservations.id, reservationId),
            eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchUploadReservations.scope, envelope.scope),
            eq(matchUploadReservations.keyHash, envelope.keyHash),
            eq(matchUploadReservations.requestHash, envelope.requestHash),
            eq(matchUploadReservations.status, "RESERVED"),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      if (updated.length === 1) return;
      const current = (
        await transaction
          .select({ status: matchUploadReservations.status })
          .from(matchUploadReservations)
          .where(
            and(
              eq(matchUploadReservations.id, reservationId),
              eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
              eq(matchUploadReservations.scope, envelope.scope),
              eq(matchUploadReservations.keyHash, envelope.keyHash),
              eq(matchUploadReservations.requestHash, envelope.requestHash),
            ),
          )
          .for("update")
          .limit(1)
      )[0];
      if (current?.status === "CANCELLED") return;
      throw new MatchServiceError(
        "PRECONDITION_FAILED",
        "업로드 예약은 이미 저장·정리·최종화되었거나 현재 요청과 일치하지 않습니다.",
      );
    });
  }

  async markPrivateImageUploadStaged(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ) {
    await withTransaction(this.database, async (transaction) => {
      await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
      const updated = await transaction
        .update(matchUploadReservations)
        .set({
          status: "STAGED",
          stagedAt: sql<Date>`coalesce(${matchUploadReservations.stagedAt}, ${now})`,
          updatedAt: now,
        })
        .where(
          and(
            eq(matchUploadReservations.id, reservationId),
            eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchUploadReservations.scope, envelope.scope),
            eq(matchUploadReservations.keyHash, envelope.keyHash),
            eq(matchUploadReservations.requestHash, envelope.requestHash),
            inArray(matchUploadReservations.status, ["RESERVED", "STAGED"]),
            gt(matchUploadReservations.expiresAt, sql<Date>`clock_timestamp()`),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      if (updated.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "업로드 저장 예약이 만료되거나 변경되었습니다.");
      }
    });
  }

  async requestPrivateImageUploadCleanup(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    failureCode: string,
    now: Date,
  ) {
    await withTransaction(this.database, async (transaction) => {
      await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
      const updated = await transaction
        .update(matchUploadReservations)
        .set({
          status: "DELETE_PENDING",
          deleteRequestedAt: now,
          deleteFailureCode: failureCode.slice(0, 64),
          updatedAt: now,
        })
        .where(
          and(
            eq(matchUploadReservations.id, reservationId),
            eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchUploadReservations.scope, envelope.scope),
            eq(matchUploadReservations.keyHash, envelope.keyHash),
            eq(matchUploadReservations.requestHash, envelope.requestHash),
            inArray(matchUploadReservations.status, ["RESERVED", "STAGED", "DELETE_PENDING"]),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      if (updated.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "정리할 업로드 예약이 없습니다.");
      }
    });
  }

  async confirmPrivateImageUploadDeleted(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    now: Date,
  ) {
    await withTransaction(this.database, async (transaction) => {
      await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
      const updated = await transaction
        .update(matchUploadReservations)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          storageDeletedAt: now,
          deleteFailureCode: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(matchUploadReservations.id, reservationId),
            eq(matchUploadReservations.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchUploadReservations.scope, envelope.scope),
            eq(matchUploadReservations.keyHash, envelope.keyHash),
            eq(matchUploadReservations.requestHash, envelope.requestHash),
            eq(matchUploadReservations.status, "DELETE_PENDING"),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      if (updated.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "삭제 확인할 업로드 예약이 없습니다.");
      }
    });
  }

  async finalizePrivateImageUpload(
    envelope: MatchCommandEnvelope,
    input: PrivateImageAttachmentInput,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, input.submissionId))
          .for("update")
          .limit(1)
      )[0];
      const reservation = (
        await transaction
          .select()
          .from(matchUploadReservations)
          .where(
            and(
              eq(matchUploadReservations.id, input.reservationId),
              gt(matchUploadReservations.expiresAt, sql<Date>`clock_timestamp()`),
            ),
          )
          .for("update")
          .limit(1)
      )[0];
      if (
        !reservation ||
        reservation.status !== "STAGED" ||
        reservation.actorUserAccountId !== envelope.actor.userAccountId ||
        reservation.submissionId !== input.submissionId ||
        reservation.scope !== envelope.scope ||
        !Buffer.from(reservation.keyHash).equals(envelope.keyHash) ||
        !Buffer.from(reservation.requestHash).equals(envelope.requestHash) ||
        reservation.expectedRevision !== input.expectedRevision ||
        reservation.gameNumber !== input.gameNumber ||
        reservation.declaredContentType !== input.contentType ||
        reservation.declaredByteSize !== input.byteSize ||
        !Buffer.from(reservation.declaredSha256).equals(input.sha256) ||
        reservation.storageProvider !== input.storageProvider ||
        reservation.storageKey !== input.storageKey
      ) {
        throw new MatchServiceError("PRECONDITION_FAILED", "업로드 작업 예약이 만료되었거나 변경되었습니다.");
      }
      const authorizedSubmission = current && (
        (envelope.actor.purpose === "ACCOUNT" &&
          current.source === "WEB" &&
          current.ownerUserAccountId === envelope.actor.userAccountId) ||
        (envelope.actor.purpose === "ADMIN" && current.source === "ADMIN")
      );
      if (!authorizedSubmission) {
        throw new MatchServiceError("NOT_FOUND", "업로드할 접수를 찾을 수 없습니다.");
      }
      if (current.revision !== input.expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "AWAITING_UPLOAD") {
        throw new MatchServiceError("INVALID_TRANSITION", "현재 접수에는 이미지를 추가할 수 없습니다.");
      }
      if (input.gameNumber < 1 || input.gameNumber > current.expectedGameCount) {
        throw new MatchServiceError("INVALID_INPUT", "게임 번호가 접수 범위를 벗어났습니다.");
      }
      const expectedIngestSource = envelope.actor.purpose === "ADMIN" ? "ADMIN" : "WEB_USER";
      if (input.ingestSource !== expectedIngestSource) {
        throw new MatchServiceError("FORBIDDEN", "업로드 세션과 비공개 자산 출처가 일치하지 않습니다.");
      }
      const existingImages = await transaction
        .select({
          gameNumber: matchSubmissionImages.gameNumber,
          sha256: privateAssets.sha256,
        })
        .from(matchSubmissionImages)
        .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
        .where(eq(matchSubmissionImages.submissionId, input.submissionId))
        .for("share");
      if (
        existingImages.some((image) => image.gameNumber === input.gameNumber) ||
        existingImages.some((image) => Buffer.from(image.sha256).equals(input.sha256))
      ) {
        throw new MatchServiceError("DUPLICATE", "같은 게임 번호 또는 이미지가 이미 등록되었습니다.");
      }
      if (existingImages.length >= current.expectedGameCount) {
        throw new MatchServiceError("IMAGE_LIMIT", "필요한 이미지가 모두 등록되었습니다.");
      }
      const assetId = randomUUID();
      const imageId = randomUUID();
      await transaction.insert(privateAssets).values({
        id: assetId,
        createdByUserAccountId: envelope.actor.userAccountId,
        ingestSource: input.ingestSource,
        storageProvider: input.storageProvider,
        storageKey: input.storageKey,
        originalFileName: input.originalFileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        width: input.width,
        height: input.height,
        sha256: input.sha256,
        purpose: "MATCH_SCOREBOARD",
        status: "STAGED",
        createdAt: now,
      });
      await transaction.insert(matchSubmissionImages).values({
        id: imageId,
        submissionId: input.submissionId,
        privateAssetId: assetId,
        gameNumber: input.gameNumber,
        ocrStatus: input.ocrResult.status,
        ocrCandidateJson:
          input.ocrResult.status === "SUCCEEDED" ? input.ocrResult.candidate : null,
        ocrErrorCode: input.ocrResult.status === "FAILED" ? input.ocrResult.errorCode : null,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
      const readyAsset = await transaction
        .update(privateAssets)
        .set({ status: "READY", readyAt: now })
        .where(and(eq(privateAssets.id, assetId), eq(privateAssets.status, "STAGED")))
        .returning({ id: privateAssets.id });
      if (readyAsset.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "비공개 자산 준비 상태 경합을 감지했습니다.");
      }
      const receivedImageCount = existingImages.length + 1;
      const nextStatus =
        receivedImageCount === current.expectedGameCount ? "PENDING_REVIEW" : "AWAITING_UPLOAD";
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            status: nextStatus,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, input.submissionId),
              eq(matchSubmissions.revision, input.expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_IMAGE_ATTACHED",
        "MATCH_SUBMISSION_IMAGE",
        imageId,
        null,
        {
          submissionId: input.submissionId,
          gameNumber: input.gameNumber,
          contentType: input.contentType,
          byteSize: input.byteSize,
          width: input.width,
          height: input.height,
          sha256: input.sha256.toString("hex"),
          assetStatus: "READY",
          ocrStatus: input.ocrResult.status,
        },
      );
      const reservationUpdate = await transaction
        .update(matchUploadReservations)
        .set({ status: "FINALIZED", finalizedAt: now, updatedAt: now })
        .where(
          and(
            eq(matchUploadReservations.id, input.reservationId),
            eq(matchUploadReservations.status, "STAGED"),
          ),
        )
        .returning({ id: matchUploadReservations.id });
      if (reservationUpdate.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "업로드 예약 최종화 경합을 감지했습니다.");
      }
      return {
        body: {
          submissionId: input.submissionId,
          imageId,
          gameNumber: input.gameNumber,
          receivedImageCount,
          expectedGameCount: current.expectedGameCount,
          status: updated.status,
          revision: updated.revision,
        },
        status: 201,
        revision: updated.revision,
      };
    });
  }

  private async consumeOcrRateLimit(
    transaction: V2Transaction,
    keyHash: Buffer,
    now: Date,
  ) {
    const windowMs = 10 * 60 * 1_000;
    const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const expiresAt = new Date(windowStartedAt.getTime() + windowMs + 15 * 60 * 1_000);
    const previousBlock = (
      await transaction
        .select({ blockedUntil: matchRateLimitBuckets.blockedUntil })
        .from(matchRateLimitBuckets)
        .where(and(
          eq(matchRateLimitBuckets.scope, "ADMIN_MUTATION"),
          eq(matchRateLimitBuckets.keyHash, keyHash),
          gt(matchRateLimitBuckets.blockedUntil, now),
        ))
        .orderBy(desc(matchRateLimitBuckets.updatedAt))
        .for("update")
        .limit(1)
    )[0];
    const row = (
      await transaction
        .insert(matchRateLimitBuckets)
        .values({
          scope: "ADMIN_MUTATION",
          keyHash,
          windowStartedAt,
          attemptCount: 1,
          expiresAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            matchRateLimitBuckets.scope,
            matchRateLimitBuckets.keyHash,
            matchRateLimitBuckets.windowStartedAt,
          ],
          set: {
            attemptCount: sql`${matchRateLimitBuckets.attemptCount} + 1`,
            expiresAt,
            updatedAt: now,
          },
        })
        .returning({
          attemptCount: matchRateLimitBuckets.attemptCount,
          blockedUntil: matchRateLimitBuckets.blockedUntil,
        })
    )[0];
    if (!row) throw new Error("MATCH_OCR_RATE_BUCKET_FAILED");
    const exceeded = row.attemptCount > 30;
    const blocked = Boolean(previousBlock || (row.blockedUntil && row.blockedUntil > now) || exceeded);
    if (exceeded && (!row.blockedUntil || row.blockedUntil <= now)) {
      await transaction
        .update(matchRateLimitBuckets)
        .set({ blockedUntil: new Date(now.getTime() + 15 * 60 * 1_000), updatedAt: now })
        .where(and(
          eq(matchRateLimitBuckets.scope, "ADMIN_MUTATION"),
          eq(matchRateLimitBuckets.keyHash, keyHash),
          eq(matchRateLimitBuckets.windowStartedAt, windowStartedAt),
        ));
    }
    return blocked;
  }

  async reservePrivateImageOcr(
    envelope: MatchCommandEnvelope,
    input: PrivateImageOcrReservationInput,
    now: Date,
  ): Promise<PrivateImageOcrReservationResult> {
    try {
      const result = await withTransaction(this.database, async (transaction) => {
        await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
        const lockMaterial = JSON.stringify([
          "klol-v2-match-ocr-preflight-lock-v1",
          envelope.actor.userAccountId,
          envelope.scope,
          envelope.keyHash.toString("hex"),
        ]);
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lockMaterial}, 0))`,
        );
        const freshNow = await databaseClock(transaction);
        await transaction
          .delete(matchCommandReceipts)
          .where(and(
            eq(matchCommandReceipts.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchCommandReceipts.scope, envelope.scope),
            eq(matchCommandReceipts.keyHash, envelope.keyHash),
            lte(matchCommandReceipts.expiresAt, freshNow),
          ));
        const replay = await receipt(transaction, envelope, freshNow);
        if (replay) return { kind: "REPLAY" as const, result: replay };
        if (envelope.actor.purpose !== "ADMIN") {
          throw new MatchServiceError("FORBIDDEN", "관리자 OCR 작업 세션이 필요합니다.");
        }

        const submission = (
          await transaction
            .select({ id: matchSubmissions.id, status: matchSubmissions.status })
            .from(matchSubmissions)
            .where(eq(matchSubmissions.id, input.submissionId))
            .for("update")
            .limit(1)
        )[0];
        if (!submission) throw new MatchServiceError("NOT_FOUND", "재분석할 비공개 이미지를 찾을 수 없습니다.");
        if (submission.status === "APPROVED" || submission.status === "CANCELLED") {
          throw new MatchServiceError("INVALID_TRANSITION", "완료되거나 취소된 접수 이미지는 재분석할 수 없습니다.");
        }
        const image = (
          await transaction
            .select()
            .from(matchSubmissionImages)
            .where(and(
              eq(matchSubmissionImages.id, input.imageId),
              eq(matchSubmissionImages.submissionId, input.submissionId),
            ))
            .for("update")
            .limit(1)
        )[0];
        if (!image) throw new MatchServiceError("NOT_FOUND", "재분석할 비공개 이미지를 찾을 수 없습니다.");

        await transaction
          .update(matchOcrReservations)
          .set({
            status: "FAILED",
            failedAt: freshNow,
            failureCode: "OCR_RESERVATION_EXPIRED",
            updatedAt: freshNow,
          })
          .where(and(
            eq(matchOcrReservations.imageId, input.imageId),
            eq(matchOcrReservations.status, "RESERVED"),
            lte(matchOcrReservations.expiresAt, sql<Date>`clock_timestamp()`),
          ));

        const existing = (
          await transaction
            .select()
            .from(matchOcrReservations)
            .where(and(
              eq(matchOcrReservations.actorUserAccountId, envelope.actor.userAccountId),
              eq(matchOcrReservations.scope, envelope.scope),
              eq(matchOcrReservations.keyHash, envelope.keyHash),
              eq(matchOcrReservations.status, "RESERVED"),
            ))
            .for("update")
            .limit(1)
        )[0];
        if (existing) {
          if (!Buffer.from(existing.requestHash).equals(envelope.requestHash)) {
            throw new MatchServiceError("IDEMPOTENCY_MISMATCH", "같은 멱등성 키가 다른 OCR 조건에 사용되었습니다.");
          }
          if (
            existing.submissionId !== input.submissionId ||
            existing.imageId !== input.imageId ||
            existing.expectedRevision !== input.expectedRevision
          ) {
            throw new MatchServiceError("IDEMPOTENCY_MISMATCH", "OCR 예약과 재시도 조건이 일치하지 않습니다.");
          }
        }
        const activeOther = existing ? null : (
          await transaction
            .select({ id: matchOcrReservations.id })
            .from(matchOcrReservations)
            .where(and(
              eq(matchOcrReservations.imageId, input.imageId),
              eq(matchOcrReservations.status, "RESERVED"),
            ))
            .for("update")
            .limit(1)
        )[0];
        if (activeOther) {
          throw new MatchServiceError("INVALID_TRANSITION", "이 이미지의 OCR 재분석이 이미 진행 중입니다.");
        }
        if (!existing && image.revision !== input.expectedRevision) {
          throw new MatchServiceError("PRECONDITION_FAILED", "이미지 분석 상태가 변경되었습니다.");
        }
        const asset = (
          await transaction
            .select({
              storageProvider: privateAssets.storageProvider,
              storageKey: privateAssets.storageKey,
              contentType: privateAssets.contentType,
              byteSize: privateAssets.byteSize,
              sha256: privateAssets.sha256,
            })
            .from(privateAssets)
            .where(and(
              eq(privateAssets.id, image.privateAssetId),
              eq(privateAssets.status, "READY"),
            ))
            .for("share")
            .limit(1)
        )[0];
        if (!asset || !["image/png", "image/jpeg", "image/webp"].includes(asset.contentType)) {
          throw new MatchServiceError("INVALID_TRANSITION", "준비된 이미지 원본이 아닙니다.");
        }
        if (existing) {
          return {
            kind: "RESERVED" as const,
            reservationId: existing.id,
            expiresAt: existing.expiresAt.toISOString(),
            gameNumber: image.gameNumber,
            reference: {
              ...asset,
              contentType: asset.contentType as PrivateImageReadReference["contentType"],
              sha256: Buffer.from(asset.sha256),
            },
          };
        }
        if (await this.consumeOcrRateLimit(transaction, input.accountRateLimitKeyHash, freshNow)) {
          return { kind: "BLOCKED" as const };
        }
        const reservationId = randomUUID();
        const expiresAt = new Date(freshNow.getTime() + MATCH_OCR_RESERVATION_TTL_MS);
        await transaction.insert(matchOcrReservations).values({
          id: reservationId,
          actorUserAccountId: envelope.actor.userAccountId,
          submissionId: input.submissionId,
          imageId: input.imageId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          expectedRevision: input.expectedRevision,
          status: "RESERVED",
          expiresAt,
          createdAt: freshNow,
          updatedAt: freshNow,
        });
        return {
          kind: "RESERVED" as const,
          reservationId,
          expiresAt: expiresAt.toISOString(),
          gameNumber: image.gameNumber,
          reference: {
            ...asset,
            contentType: asset.contentType as PrivateImageReadReference["contentType"],
            sha256: Buffer.from(asset.sha256),
          },
        };
      });
      if (result.kind === "BLOCKED") {
        throw new MatchServiceError("RATE_LIMITED", "OCR 재분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
      }
      return result;
    } catch (error) {
      translateConstraint(error);
    }
  }

  async finalizePrivateImageOcr(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    ocrResult: PrivateImageOcrResult,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const hint = (
        await transaction
          .select({
            submissionId: matchOcrReservations.submissionId,
            imageId: matchOcrReservations.imageId,
          })
          .from(matchOcrReservations)
          .where(eq(matchOcrReservations.id, reservationId))
          .limit(1)
      )[0];
      if (!hint) throw new MatchServiceError("PRECONDITION_FAILED", "OCR 작업 예약을 찾을 수 없습니다.");
      const submission = (
        await transaction
          .select({ id: matchSubmissions.id, status: matchSubmissions.status })
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, hint.submissionId))
          .for("update")
          .limit(1)
      )[0];
      const current = (
        await transaction
          .select()
          .from(matchSubmissionImages)
          .where(and(
            eq(matchSubmissionImages.id, hint.imageId),
            eq(matchSubmissionImages.submissionId, hint.submissionId),
          ))
          .for("update")
          .limit(1)
      )[0];
      const reservation = (
        await transaction
          .select()
          .from(matchOcrReservations)
          .where(and(
            eq(matchOcrReservations.id, reservationId),
            gt(matchOcrReservations.expiresAt, sql<Date>`clock_timestamp()`),
          ))
          .for("update")
          .limit(1)
      )[0];
      if (
        !submission ||
        submission.status === "APPROVED" ||
        submission.status === "CANCELLED" ||
        !current ||
        !reservation ||
        reservation.status !== "RESERVED" ||
        reservation.actorUserAccountId !== envelope.actor.userAccountId ||
        reservation.scope !== envelope.scope ||
        !Buffer.from(reservation.keyHash).equals(envelope.keyHash) ||
        !Buffer.from(reservation.requestHash).equals(envelope.requestHash) ||
        current.revision !== reservation.expectedRevision
      ) {
        throw new MatchServiceError("PRECONDITION_FAILED", "OCR 작업 예약이 만료되거나 대상이 변경되었습니다.");
      }
      const asset = (
        await transaction
          .select({ id: privateAssets.id })
          .from(privateAssets)
          .where(and(
            eq(privateAssets.id, current.privateAssetId),
            eq(privateAssets.status, "READY"),
          ))
          .for("share")
          .limit(1)
      )[0];
      if (!asset) throw new MatchServiceError("INVALID_TRANSITION", "준비된 이미지 원본이 아닙니다.");
      const updated = (
        await transaction
          .update(matchSubmissionImages)
          .set({
            ocrStatus: ocrResult.status,
            ocrCandidateJson: ocrResult.status === "SUCCEEDED" ? ocrResult.candidate : null,
            ocrErrorCode: ocrResult.status === "FAILED" ? ocrResult.errorCode : null,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(and(
            eq(matchSubmissionImages.id, current.id),
            eq(matchSubmissionImages.revision, reservation.expectedRevision),
          ))
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "이미지 분석 상태가 변경되었습니다.");
      const finalized = await transaction
        .update(matchOcrReservations)
        .set({ status: "FINALIZED", finalizedAt: now, updatedAt: now })
        .where(and(
          eq(matchOcrReservations.id, reservation.id),
          eq(matchOcrReservations.status, "RESERVED"),
        ))
        .returning({ id: matchOcrReservations.id });
      if (finalized.length !== 1) {
        throw new MatchServiceError("PRECONDITION_FAILED", "OCR 예약 최종화 경합을 감지했습니다.");
      }
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_IMAGE_OCR_RETRIED",
        "MATCH_SUBMISSION_IMAGE",
        current.id,
        { submissionId: current.submissionId, ocrStatus: current.ocrStatus, revision: current.revision },
        {
          submissionId: current.submissionId,
          ocrStatus: updated.ocrStatus,
          ocrErrorCode: updated.ocrErrorCode,
          revision: updated.revision,
          reservationId: reservation.id,
        },
      );
      return {
        body: {
          submissionId: current.submissionId,
          imageId: current.id,
          ocrStatus: updated.ocrStatus,
          ocrErrorCode: updated.ocrErrorCode,
          revision: updated.revision,
        },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async failPrivateImageOcr(
    envelope: MatchCommandEnvelope,
    reservationId: string,
    failureCode: string,
    now: Date,
  ) {
    const safeFailureCode = /^[A-Z0-9_]{1,64}$/.test(failureCode)
      ? failureCode
      : "OCR_WORK_FAILED";
    await withTransaction(this.database, async (transaction) => {
      await this.authorizer.assertAuthorized(transaction, envelope.actor, now);
      const updated = await transaction
        .update(matchOcrReservations)
        .set({
          status: "FAILED",
          failedAt: now,
          failureCode: safeFailureCode,
          updatedAt: now,
        })
        .where(and(
          eq(matchOcrReservations.id, reservationId),
          eq(matchOcrReservations.actorUserAccountId, envelope.actor.userAccountId),
          eq(matchOcrReservations.scope, envelope.scope),
          eq(matchOcrReservations.keyHash, envelope.keyHash),
          eq(matchOcrReservations.requestHash, envelope.requestHash),
          eq(matchOcrReservations.status, "RESERVED"),
        ))
        .returning({ id: matchOcrReservations.id });
      if (updated.length === 1) return;
      const current = (
        await transaction
          .select({ status: matchOcrReservations.status })
          .from(matchOcrReservations)
          .where(and(
            eq(matchOcrReservations.id, reservationId),
            eq(matchOcrReservations.actorUserAccountId, envelope.actor.userAccountId),
            eq(matchOcrReservations.scope, envelope.scope),
            eq(matchOcrReservations.keyHash, envelope.keyHash),
            eq(matchOcrReservations.requestHash, envelope.requestHash),
          ))
          .for("update")
          .limit(1)
      )[0];
      if (current?.status === "FAILED" || current?.status === "FINALIZED") return;
      throw new MatchServiceError("PRECONDITION_FAILED", "종료할 OCR 작업 예약이 없습니다.");
    });
  }

  async saveSubmissionReviewDraft(
    envelope: MatchCommandEnvelope,
    input: SubmissionReviewDraftInput,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, input.submissionId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "접수를 찾을 수 없습니다.");
      if (current.revision !== input.expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "PENDING_REVIEW") {
        throw new MatchServiceError("INVALID_TRANSITION", "검토 대기 접수만 검토안을 저장할 수 있습니다.");
      }
      await this.assertSubmissionSeason(transaction, input.seasonId);
      const parsed = parseReviewedGames(input.reviewedResult, current.expectedGameCount);
      if (!parsed) throw new MatchServiceError("INVALID_INPUT", "검토 결과 구조가 올바르지 않습니다.");
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            seasonId: input.seasonId,
            reviewedResultJson: input.reviewedResult,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, input.submissionId),
              eq(matchSubmissions.revision, input.expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_REVIEW_DRAFT_SAVED",
        "MATCH_SUBMISSION",
        input.submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
        { reviewedResultDigest: digest(input.reviewedResult).toString("hex") },
      );
      return {
        body: { submissionId: input.submissionId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async approveSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    reviewedGames: readonly MatchGameInput[],
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, submissionId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "접수를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "PENDING_REVIEW") {
        throw new MatchServiceError("INVALID_TRANSITION", "검토 대기 접수만 승인할 수 있습니다.");
      }
      if (!current.seasonId) {
        throw new MatchServiceError("INVALID_TRANSITION", "승인 전에 시즌을 명시적으로 연결해 주세요.");
      }
      if (current.teamBalanceDraftId) {
        if (current.source !== "WEB") {
          throw new MatchServiceError("INVALID_TRANSITION", "웹 소유자 접수만 팀 초안 출처를 사용할 수 있습니다.");
        }
        await this.assertSubmissionTeamBalanceDraft(
          transaction,
          current.teamBalanceDraftId,
          current.ownerUserAccountId,
        );
      }
      const storedGames = current.reviewedResultJson
        ? parseReviewedGames(current.reviewedResultJson, current.expectedGameCount)
        : null;
      if (
        !storedGames ||
        stableMatchJson(storedGames) !== stableMatchJson(reviewedGames)
      ) {
        throw new MatchServiceError("INVALID_INPUT", "저장된 관리자 검토 결과와 승인 입력이 다릅니다.");
      }
      const imageRows = await transaction
        .select({
          gameNumber: matchSubmissionImages.gameNumber,
          ocrStatus: matchSubmissionImages.ocrStatus,
          assetStatus: privateAssets.status,
        })
        .from(matchSubmissionImages)
        .innerJoin(privateAssets, eq(privateAssets.id, matchSubmissionImages.privateAssetId))
        .where(eq(matchSubmissionImages.submissionId, submissionId))
        .orderBy(asc(matchSubmissionImages.gameNumber))
        .for("share");
      if (
        imageRows.length !== current.expectedGameCount ||
        imageRows.some((image, index) => image.gameNumber !== index + 1) ||
        imageRows.some(
          (image) =>
            image.assetStatus !== "READY" ||
            (image.ocrStatus !== "SUCCEEDED" && image.ocrStatus !== "FAILED"),
        )
      ) {
        throw new MatchServiceError(
          "INVALID_TRANSITION",
          "모든 게임 이미지가 안전하게 저장되고 OCR 처리가 종료되어야 합니다.",
        );
      }
      const matchInput: MatchRecordInput = {
        seasonId: current.seasonId,
        title: current.title,
        playedOn: current.playedOn,
        startedAt: current.startedAt,
        startedAtOffsetMinutes: current.startedAtOffsetMinutes,
        games: reviewedGames,
      };
      const created = await this.insertMatchAggregate(
        transaction,
        envelope,
        matchInput,
        matchSeriesProvenanceFromSubmission(current),
        "PUBLISHED",
        now,
      );
      await this.assertPublishable(transaction, created.row.id);
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            status: "APPROVED",
            publicReviewReason: null,
            reviewedByUserAccountId: envelope.actor.userAccountId,
            reviewedAt: now,
            approvedMatchSeriesId: created.row.id,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, submissionId),
              eq(matchSubmissions.revision, expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      const matchAfter = matchSnapshot(created.row, created.games);
      await this.audit(
        transaction,
        envelope,
        "MATCH_CREATED_FROM_SUBMISSION",
        "MATCH_SERIES",
        created.row.id,
        null,
        matchAfter,
        { submissionId, teamBalanceDraftId: current.teamBalanceDraftId },
      );
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_APPROVED",
        "MATCH_SUBMISSION",
        submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
        { matchId: created.row.id, reviewedResultDigest: digest(reviewedGames).toString("hex") },
      );
      await this.outbox(
        transaction,
        created.row,
        "PUBLISHED",
        null,
        orderKey(created.row),
        null,
        created.row.seasonId,
        matchAfter,
        now,
      );
      return {
        body: {
          submissionId,
          matchId: created.row.id,
          status: updated.status,
          revision: updated.revision,
        },
        status: 201,
        revision: updated.revision,
      };
    });
  }

  async rejectSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    reason: string,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, submissionId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "접수를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "PENDING_REVIEW") {
        throw new MatchServiceError("INVALID_TRANSITION", "검토 대기 접수만 거절할 수 있습니다.");
      }
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            status: "REJECTED",
            publicReviewReason: reason,
            reviewedByUserAccountId: envelope.actor.userAccountId,
            reviewedAt: now,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, submissionId),
              eq(matchSubmissions.revision, expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_REJECTED",
        "MATCH_SUBMISSION",
        submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
      );
      return {
        body: { submissionId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async reopenSubmission(
    envelope: MatchCommandEnvelope,
    submissionId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, now, async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(matchSubmissions)
          .where(eq(matchSubmissions.id, submissionId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new MatchServiceError("NOT_FOUND", "접수를 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new MatchServiceError("PRECONDITION_FAILED", "접수가 다른 요청에서 변경되었습니다.");
      }
      if (current.status !== "REJECTED") {
        throw new MatchServiceError("INVALID_TRANSITION", "거절된 접수만 다시 열 수 있습니다.");
      }
      const updated = (
        await transaction
          .update(matchSubmissions)
          .set({
            status: "PENDING_REVIEW",
            publicReviewReason: null,
            reviewedByUserAccountId: null,
            reviewedAt: null,
            revision: current.revision + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(matchSubmissions.id, submissionId),
              eq(matchSubmissions.revision, expectedRevision),
            ),
          )
          .returning()
      )[0];
      if (!updated) throw new MatchServiceError("PRECONDITION_FAILED", "접수가 변경되었습니다.");
      await this.audit(
        transaction,
        envelope,
        "MATCH_SUBMISSION_REOPENED",
        "MATCH_SUBMISSION",
        submissionId,
        submissionSnapshot(current),
        submissionSnapshot(updated),
      );
      return {
        body: { submissionId, status: updated.status, revision: updated.revision },
        status: 200,
        revision: updated.revision,
      };
    });
  }
}
