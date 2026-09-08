import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { auditEvents } from "@/platform/db/schema/audit";
import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { userAccounts } from "@/platform/db/schema/auth";
import { players } from "@/platform/db/schema/registry";
import {
  seasonApplications,
  seasonCommandReceipts,
  seasonKakaoPendingApplications,
  seasons,
} from "@/platform/db/schema/seasons";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  AdminWorkspaceQuery,
  AdminKakaoPendingQuery,
  CommandEnvelope,
  CreateSeasonInput,
  MutationResult,
  ReviewApplicationInput,
  ResolveKakaoPendingInput,
  SeasonAuditWriter,
  SeasonRepository,
  UpdateSeasonInput,
  UpsertOwnApplicationInput,
} from "../application/ports/season-repository";
import {
  SEASON_APPLICATION_MERGE_POLICY,
  planSeasonApplicationMerge,
  planSiteApplicationMerge,
} from "../domain/application-source-policy";
import {
  kstDateKey,
  normalizedSeasonIdentity,
  seasonAcceptsApplications,
  SEASON_COMMAND_RECEIPT_TTL_MS,
  SeasonServiceError,
  type AdminSeason,
  type AdminSeasonApplication,
  type AdminSeasonKakaoPendingApplication,
  type OwnSeasonApplication,
  type PublicSeason,
} from "../domain/season";

type SeasonRow = typeof seasons.$inferSelect;
type ApplicationRow = typeof seasonApplications.$inferSelect;
type PendingApplicationRow = typeof seasonKakaoPendingApplications.$inferSelect;
type SuccessfulBody = Record<string, unknown>;

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function publicSeason(row: SeasonRow, now: Date): PublicSeason {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    applicationsOpen: seasonAcceptsApplications(row, now),
    applicationsOpenAt: iso(row.applicationsOpenAt),
    applicationsCloseAt: iso(row.applicationsCloseAt),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
  };
}

function ownApplication(row: ApplicationRow): OwnSeasonApplication {
  return {
    id: row.id,
    seasonId: row.seasonId,
    applyDate: row.applyDate,
    recruitNo: row.recruitNo,
    mainPosition: row.mainPosition,
    subPositions: row.subPositions,
    status: row.status,
    source: row.source,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function publicApplicationBody(row: ApplicationRow) {
  return { application: ownApplication(row), revision: row.revision };
}

function seasonAuditSnapshot(row: SeasonRow): Record<string, unknown> {
  return {
    name: row.name,
    status: row.status,
    applicationsOpenAt: iso(row.applicationsOpenAt),
    applicationsCloseAt: iso(row.applicationsCloseAt),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    clonedFromSeasonId: row.clonedFromSeasonId,
    activatedAt: iso(row.activatedAt),
    endedAt: iso(row.endedAt),
    retiredAt: iso(row.retiredAt),
    revision: row.revision,
  };
}

function applicationAuditSnapshot(row: ApplicationRow): Record<string, unknown> {
  return {
    seasonId: row.seasonId,
    playerId: row.playerId,
    applyDate: row.applyDate,
    recruitNo: row.recruitNo,
    mainPosition: row.mainPosition,
    subPositions: row.subPositions,
    status: row.status,
    source: row.source,
    reviewNote: row.reviewNote,
    reviewedAt: iso(row.reviewedAt),
    reviewedByUserAccountId: row.reviewedByUserAccountId,
    cancelledAt: iso(row.cancelledAt),
    revision: row.revision,
  };
}

function pendingAuditSnapshot(row: PendingApplicationRow): Record<string, unknown> {
  return {
    seasonId: row.seasonId,
    matchedPlayerId: row.matchedPlayerId,
    applyDate: row.applyDate,
    recruitNo: row.recruitNo,
    slotNo: row.slotNo,
    suppliedName: row.suppliedName,
    suppliedRiotId: row.suppliedRiotId,
    mainPosition: row.mainPosition,
    subPositions: row.subPositions,
    reserve: row.reserve,
    matchState: row.matchState,
    status: row.status,
    cancelledAt: iso(row.cancelledAt),
    resolvedAt: iso(row.resolvedAt),
    revision: row.revision,
  };
}

function adminPendingApplication(
  row: PendingApplicationRow,
  seasonName: string,
  player: { id: string; nickname: string; tagLine: string } | null,
): AdminSeasonKakaoPendingApplication {
  return {
    id: row.id,
    seasonId: row.seasonId,
    seasonName,
    applyDate: row.applyDate,
    recruitNo: row.recruitNo,
    slotNo: row.slotNo,
    suppliedName: row.suppliedName,
    suppliedRiotId: row.suppliedRiotId,
    mainPosition: row.mainPosition,
    subPositions: row.subPositions,
    reserve: row.reserve,
    matchState: row.matchState,
    status: row.status,
    matchedPlayer: player ? { id: player.id, displayName: player.nickname, riotId: `${player.nickname}#${player.tagLine}` } : null,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SUPER_ADMIN_MUTATION_SESSION_POLICY = {
  ...ADMIN_MUTATION_SESSION_POLICY,
  minimumRole: "SUPER_ADMIN" as const,
};

function postgresDetails(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code) return candidate;
    current = candidate.cause;
  }
  return {};
}

function throwConstraintConflict(error: unknown): never {
  const details = postgresDetails(error);
  if (details.code === "23505" && details.constraint === "seasons_single_active_uidx") {
    throw new SeasonServiceError("ACTIVE_SEASON_EXISTS", "이미 활성 시즌이 있습니다.");
  }
  if (
    details.code === "23505" &&
    [
      "seasons_name_normalized_uidx",
      "seasons_legacy_id_uidx",
      "season_applications_identity_slot_uidx",
      "season_applications_legacy_id_uidx",
    ].includes(details.constraint ?? "")
  ) {
    throw new SeasonServiceError("DUPLICATE", "같은 식별 조건의 데이터가 이미 있습니다.");
  }
  throw error;
}

async function existingReceipt(
  database: DatabaseExecutor,
  envelope: CommandEnvelope,
): Promise<MutationResult<SuccessfulBody> | null> {
  const rows = await database
    .select()
    .from(seasonCommandReceipts)
    .where(
      and(
        eq(seasonCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
        eq(seasonCommandReceipts.scope, envelope.scope),
        eq(seasonCommandReceipts.keyHash, envelope.keyHash),
        sql<boolean>`${seasonCommandReceipts.expiresAt} > clock_timestamp()`,
      ),
    )
    .limit(1);
  const receipt = rows[0];
  if (!receipt) return null;
  if (!Buffer.from(receipt.requestHash).equals(envelope.requestHash)) {
    throw new SeasonServiceError(
      "IDEMPOTENCY_MISMATCH",
      "같은 멱등성 키가 다른 요청에 사용되었습니다.",
    );
  }
  const revision = receipt.responseJson.revision;
  return {
    body: receipt.responseJson,
    status: receipt.responseStatus,
    ...(typeof revision === "number" ? { revision } : {}),
    replayed: true,
  };
}

export class PostgresSeasonAuditWriter implements SeasonAuditWriter {
  async append(
    executor: DatabaseExecutor,
    event: Parameters<SeasonAuditWriter["append"]>[1],
  ): Promise<void> {
    await executor.insert(auditEvents).values({
      requestId: event.requestId,
      actorUserAccountId: event.actorUserAccountId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      beforeJson: event.before,
      afterJson: event.after,
      metadataJson: event.metadata,
    });
  }
}

export class PostgresSeasonRepository implements SeasonRepository {
  constructor(
    private readonly database: V2Database,
    private readonly auditWriter: SeasonAuditWriter = new PostgresSeasonAuditWriter(),
  ) {}

  private async idempotent(
    envelope: CommandEnvelope,
    requiredAuthorization: CommandEnvelope["authorization"],
    work: (transaction: V2Transaction) => Promise<Omit<MutationResult<SuccessfulBody>, "replayed">>,
  ): Promise<MutationResult<SuccessfulBody>> {
    const receiptNow = new Date();
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (envelope.authorization !== requiredAuthorization) {
          throw new SeasonServiceError("FORBIDDEN", "이 명령에 허용되지 않은 세션 목적입니다.");
        }
        if (envelope.actorUserAccountId !== envelope.actorSession.userAccountId) {
          throw new SeasonServiceError("SESSION_STALE", "로그인 세션이 더 이상 유효하지 않습니다.");
        }
        const policy = requiredAuthorization === "SUPER_ADMIN_MUTATION"
          ? SUPER_ADMIN_MUTATION_SESSION_POLICY
          : requiredAuthorization === "ADMIN_MUTATION"
            ? ADMIN_MUTATION_SESSION_POLICY
            : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
        if (
          !(await lockTransactionSessionActor(
            transaction,
            envelope.actorSession,
            receiptNow,
            policy,
          ))
        ) {
          throw new SeasonServiceError("SESSION_STALE", "로그인 세션이 더 이상 유효하지 않습니다.");
        }

        const receiptLockKey = `${envelope.actorUserAccountId}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${receiptLockKey}, 0))`,
        );
        // Ordinary commands clean up only their own expired identity. Global
        // bounded cleanup belongs to the S13 scheduler so user requests never
        // become unbounded retention workers or amplify unrelated locks.
        await transaction
          .delete(seasonCommandReceipts)
          .where(and(
            eq(seasonCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
            eq(seasonCommandReceipts.scope, envelope.scope),
            eq(seasonCommandReceipts.keyHash, envelope.keyHash),
            sql<boolean>`${seasonCommandReceipts.expiresAt} <= clock_timestamp()`,
          ));
        const replay = await existingReceipt(transaction, envelope);
        if (replay) return replay;
        await transaction.insert(seasonCommandReceipts).values({
          id: randomUUID(),
          actorUserAccountId: envelope.actorUserAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { pending: true },
          createdAt: sql`clock_timestamp()`,
          expiresAt: sql`clock_timestamp() + (${SEASON_COMMAND_RECEIPT_TTL_MS} * interval '1 millisecond')`,
        });
        const result = await work(transaction);
        await transaction
          .update(seasonCommandReceipts)
          .set({ responseStatus: result.status, responseJson: result.body })
          .where(
            and(
              eq(seasonCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
              eq(seasonCommandReceipts.scope, envelope.scope),
              eq(seasonCommandReceipts.keyHash, envelope.keyHash),
            ),
          );
        return { ...result, replayed: false };
      });
    } catch (error) {
      throwConstraintConflict(error);
    }
  }

  async listPublicSeasons(now: Date): Promise<readonly PublicSeason[]> {
    const rows = await this.database
      .select()
      .from(seasons)
      .where(inArray(seasons.status, ["ACTIVE", "ENDED"]))
      .orderBy(desc(seasons.createdAt))
      .limit(50);
    return rows.map((row) => publicSeason(row, now));
  }

  async getCurrentSeason(now: Date): Promise<PublicSeason | null> {
    const rows = await this.database
      .select()
      .from(seasons)
      .where(eq(seasons.status, "ACTIVE"))
      .limit(1);
    return rows[0] ? publicSeason(rows[0], now) : null;
  }

  async getApplicationHub(actorUserAccountId: string | null, now: Date, recruitNo: number) {
    const today = kstDateKey(now);
    let viewer: "ANONYMOUS" | "RESTRICTED" | "APPROVED" = "ANONYMOUS";
    let applicantPlayerId: string | null = null;
    let applicantPlayer: Readonly<{ id: string; displayName: string; riotId: string }> | null = null;
    if (actorUserAccountId) {
      const accountRows = await this.database
        .select({ status: userAccounts.status, deletedAt: userAccounts.deletedAt })
        .from(userAccounts)
        .where(eq(userAccounts.id, actorUserAccountId))
        .limit(1);
      const account = accountRows[0];
      viewer = account?.status === "APPROVED" && account.deletedAt === null ? "APPROVED" : "RESTRICTED";
      if (viewer === "APPROVED") {
        const actorPlayers = await this.database
          .select({ id: players.id, nickname: players.nickname, tagLine: players.tagLine })
          .from(players)
          .where(and(eq(players.userAccountId, actorUserAccountId), eq(players.status, "ACTIVE")))
          .limit(1);
        const actorPlayer = actorPlayers[0];
        applicantPlayerId = actorPlayer?.id ?? null;
        applicantPlayer = actorPlayer
          ? { id: actorPlayer.id, displayName: actorPlayer.nickname, riotId: `${actorPlayer.nickname}#${actorPlayer.tagLine}` }
          : null;
      }
    }
    const seasonRows = await this.database
      .select()
      .from(seasons)
      .where(eq(seasons.status, "ACTIVE"))
      .limit(1);
    const season = seasonRows[0];
    if (!season) {
      return {
        currentSeason: null,
        myApplication: null,
        participants: [],
        counts: { applied: 0, reserve: 0, confirmed: 0 },
        viewer,
        canApply: false,
        hasActivePlayer: Boolean(applicantPlayerId),
        applicantPlayer,
        applyDate: today,
        participantTotal: 0,
        participantsTruncated: false,
        selectedRecruitNo: recruitNo,
        availableRecruitNos: [1],
      };
    }

    const [applicationRoundRows, pendingRoundRows] = await Promise.all([
      this.database
        .selectDistinct({ recruitNo: seasonApplications.recruitNo })
        .from(seasonApplications)
        .where(and(
          eq(seasonApplications.seasonId, season.id),
          eq(seasonApplications.applyDate, today),
          inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
        )),
      this.database
        .selectDistinct({ recruitNo: seasonKakaoPendingApplications.recruitNo })
        .from(seasonKakaoPendingApplications)
        .where(and(
          eq(seasonKakaoPendingApplications.seasonId, season.id),
          eq(seasonKakaoPendingApplications.applyDate, today),
          eq(seasonKakaoPendingApplications.status, "ACTIVE"),
        )),
    ]);
    const availableRecruitNos = [...new Set([
      1,
      ...applicationRoundRows.map((row) => row.recruitNo),
      ...pendingRoundRows.map((row) => row.recruitNo),
    ])].sort((left, right) => left - right);
    if (!availableRecruitNos.includes(recruitNo)) {
      throw new SeasonServiceError("INVALID_INPUT", "현재 공개된 모집 회차가 아닙니다.");
    }

    const publicPredicates = and(
      eq(seasonApplications.seasonId, season.id),
      eq(seasonApplications.applyDate, today),
      eq(seasonApplications.recruitNo, recruitNo),
      inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
      eq(players.status, "ACTIVE"),
    );
    const publicRows = await this.database
      .select({
        application: seasonApplications,
        playerId: players.id,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(seasonApplications)
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(publicPredicates)
      .orderBy(asc(seasonApplications.applyDate), asc(seasonApplications.recruitNo), asc(seasonApplications.createdAt))
      .limit(200);
    const participantCountRows = await this.database
      .select({ status: seasonApplications.status, value: count() })
      .from(seasonApplications)
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(publicPredicates)
      .groupBy(seasonApplications.status);
    const counts = { applied: 0, reserve: 0, confirmed: 0 };
    for (const row of participantCountRows) {
      if (row.status === "APPLIED") counts.applied = row.value;
      if (row.status === "RESERVE") counts.reserve = row.value;
      if (row.status === "CONFIRMED") counts.confirmed = row.value;
    }
    const participantTotal = counts.applied + counts.reserve + counts.confirmed;

    let mine: OwnSeasonApplication | null = null;
    if (actorUserAccountId && viewer === "APPROVED") {
      const ownRows = await this.database
        .select({ application: seasonApplications })
        .from(seasonApplications)
        .innerJoin(players, eq(players.id, seasonApplications.playerId))
        .where(
          and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.applyDate, today),
            eq(seasonApplications.recruitNo, recruitNo),
            eq(players.userAccountId, actorUserAccountId),
          ),
        )
        .orderBy(desc(seasonApplications.updatedAt))
        .limit(1);
      if (ownRows[0]) mine = ownApplication(ownRows[0].application);
    }

    return {
      currentSeason: publicSeason(season, now),
      myApplication: mine,
      participants: publicRows.map((row) => ({
        player: {
          id: row.playerId,
          displayName: row.nickname,
          riotId: `${row.nickname}#${row.tagLine}`,
        },
        applyDate: row.application.applyDate,
        recruitNo: row.application.recruitNo,
        mainPosition: row.application.mainPosition,
        subPositions: row.application.subPositions,
        status: row.application.status as "APPLIED" | "RESERVE" | "CONFIRMED",
      })),
      counts,
      viewer,
      canApply: Boolean(
        applicantPlayerId &&
        seasonAcceptsApplications(season, now) &&
        (!mine || mine.status === "APPLIED" || mine.status === "CANCELLED"),
      ),
      hasActivePlayer: Boolean(applicantPlayerId),
      applicantPlayer,
      applyDate: today,
      participantTotal,
      participantsTruncated: participantTotal > publicRows.length,
      selectedRecruitNo: recruitNo,
      availableRecruitNos,
    };
  }

  async findOwnApplication(actorUserAccountId: string, now: Date, recruitNo: number) {
    return (await this.getApplicationHub(actorUserAccountId, now, recruitNo)).myApplication;
  }

  async getAdminWorkspace(query: AdminWorkspaceQuery) {
    const seasonRows = await this.database.select().from(seasons).orderBy(desc(seasons.createdAt)).limit(100);
    const countRows = await this.database
      .select({ seasonId: seasonApplications.seasonId, value: count() })
      .from(seasonApplications)
      .groupBy(seasonApplications.seasonId);
    const counts = new Map(countRows.map((row) => [row.seasonId, row.value]));

    const predicates = [];
    if (query.seasonId) predicates.push(eq(seasonApplications.seasonId, query.seasonId));
    if (query.status) predicates.push(eq(seasonApplications.status, query.status));
    if (query.source) predicates.push(eq(seasonApplications.source, query.source));
    if (query.query) {
      const escaped = query.query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
      const pattern = `%${escaped}%`;
      predicates.push(
        or(
          ilike(players.memberName, pattern),
          ilike(players.nickname, pattern),
          ilike(sql<string>`${players.nickname} || '#' || ${players.tagLine}`, pattern),
        )!,
      );
    }
    const where = predicates.length ? and(...predicates) : undefined;
    const totalRows = await this.database
      .select({ value: count() })
      .from(seasonApplications)
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(where);
    const totalCount = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const page = Math.min(Math.max(1, query.page), totalPages);

    const applicationRows = await this.database
      .select({
        application: seasonApplications,
        seasonName: seasons.name,
        playerId: players.id,
        memberName: players.memberName,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(seasonApplications)
      .innerJoin(seasons, eq(seasons.id, seasonApplications.seasonId))
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(where)
      .orderBy(desc(seasonApplications.createdAt), asc(players.nicknameNormalized))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);

    const adminSeasons: AdminSeason[] = seasonRows.map((row) => ({
      id: row.id,
      legacyId: row.legacyId,
      name: row.name,
      status: row.status,
      applicationsOpenAt: iso(row.applicationsOpenAt),
      applicationsCloseAt: iso(row.applicationsCloseAt),
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      clonedFromSeasonId: row.clonedFromSeasonId,
      revision: row.revision,
      applicationCount: counts.get(row.id) ?? 0,
      activatedAt: iso(row.activatedAt),
      endedAt: iso(row.endedAt),
      retiredAt: iso(row.retiredAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    const adminApplications: AdminSeasonApplication[] = applicationRows.map((row) => ({
      id: row.application.id,
      seasonId: row.application.seasonId,
      seasonName: row.seasonName,
      player: {
        id: row.playerId,
        memberName: row.memberName,
        displayName: row.nickname,
        riotId: `${row.nickname}#${row.tagLine}`,
      },
      applyDate: row.application.applyDate,
      recruitNo: row.application.recruitNo,
      mainPosition: row.application.mainPosition,
      subPositions: row.application.subPositions,
      status: row.application.status,
      source: row.application.source,
      reviewNote: row.application.reviewNote,
      revision: row.application.revision,
      createdAt: row.application.createdAt.toISOString(),
      updatedAt: row.application.updatedAt.toISOString(),
    }));
    return {
      seasons: adminSeasons,
      applications: adminApplications,
      applicationPage: page,
      applicationPageSize: query.pageSize,
      applicationTotalCount: totalCount,
      applicationTotalPages: totalPages,
    };
  }

  async getKakaoPendingApplications(query: AdminKakaoPendingQuery) {
    const predicates = [];
    if (query.seasonId) predicates.push(eq(seasonKakaoPendingApplications.seasonId, query.seasonId));
    if (query.applyDate) predicates.push(eq(seasonKakaoPendingApplications.applyDate, query.applyDate));
    if (query.recruitNo) predicates.push(eq(seasonKakaoPendingApplications.recruitNo, query.recruitNo));
    if (query.matchState) predicates.push(eq(seasonKakaoPendingApplications.matchState, query.matchState));
    if (query.status) predicates.push(eq(seasonKakaoPendingApplications.status, query.status));
    if (query.query) {
      const escaped = query.query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
      const pattern = `%${escaped}%`;
      predicates.push(or(
        ilike(seasonKakaoPendingApplications.suppliedName, pattern),
        ilike(seasonKakaoPendingApplications.suppliedRiotId, pattern),
      )!);
    }
    const where = predicates.length ? and(...predicates) : undefined;
    const countRows = await this.database.select({ value: count() }).from(seasonKakaoPendingApplications).where(where);
    const totalCount = countRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const page = Math.min(Math.max(1, query.page), totalPages);
    const rows = await this.database
      .select({ pending: seasonKakaoPendingApplications, seasonName: seasons.name, player: players })
      .from(seasonKakaoPendingApplications)
      .innerJoin(seasons, eq(seasons.id, seasonKakaoPendingApplications.seasonId))
      .leftJoin(players, eq(players.id, seasonKakaoPendingApplications.matchedPlayerId))
      .where(where)
      .orderBy(desc(seasonKakaoPendingApplications.updatedAt), asc(seasonKakaoPendingApplications.slotNo))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);
    return {
      applications: rows.map((row) => adminPendingApplication(row.pending, row.seasonName, row.player)),
      page,
      pageSize: query.pageSize,
      totalCount,
      totalPages,
    };
  }

  async getKakaoPendingApplication(id: string, candidateQuery: string) {
    const rows = await this.database
      .select({ pending: seasonKakaoPendingApplications, seasonName: seasons.name, player: players })
      .from(seasonKakaoPendingApplications)
      .innerJoin(seasons, eq(seasons.id, seasonKakaoPendingApplications.seasonId))
      .leftJoin(players, eq(players.id, seasonKakaoPendingApplications.matchedPlayerId))
      .where(eq(seasonKakaoPendingApplications.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new SeasonServiceError("NOT_FOUND", "Kakao 보류 신청을 찾을 수 없습니다.");
    const lookup = candidateQuery || row.pending.suppliedRiotId || row.pending.suppliedName;
    const escaped = lookup.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    const candidateRows = await this.database
      .select({ id: players.id, nickname: players.nickname, tagLine: players.tagLine })
      .from(players)
      .where(and(
        eq(players.status, "ACTIVE"),
        or(
          ilike(players.memberName, pattern),
          ilike(players.nickname, pattern),
          ilike(sql<string>`${players.nickname} || '#' || ${players.tagLine}`, pattern),
        ),
      ))
      .orderBy(asc(players.nicknameNormalized), asc(players.id))
      .limit(50);
    const candidateMap = new Map(candidateRows.map((candidate) => [candidate.id, candidate]));
    if (row.player) candidateMap.set(row.player.id, row.player);
    return {
      application: adminPendingApplication(row.pending, row.seasonName, row.player),
      candidateQuery,
      candidates: [...candidateMap.values()].map((candidate) => ({
        id: candidate.id,
        displayName: candidate.nickname,
        riotId: `${candidate.nickname}#${candidate.tagLine}`,
      })),
    };
  }

  async getConfirmedApplicationsForTeamBalance(seasonId: string, applyDate: string, recruitNo: number) {
    const seasonRows = await this.database.select({ id: seasons.id, name: seasons.name }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    const season = seasonRows[0];
    if (!season) throw new SeasonServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
    const rows = await this.database
      .select({ application: seasonApplications, playerId: players.id, displayName: players.nickname })
      .from(seasonApplications)
      .innerJoin(players, eq(players.id, seasonApplications.playerId))
      .where(and(
        eq(seasonApplications.seasonId, seasonId),
        eq(seasonApplications.applyDate, applyDate),
        eq(seasonApplications.recruitNo, recruitNo),
        eq(seasonApplications.status, "CONFIRMED"),
        eq(players.status, "ACTIVE"),
      ))
      .orderBy(asc(seasonApplications.createdAt), asc(seasonApplications.id))
      .limit(50);
    return {
      season,
      applyDate,
      recruitNo,
      participants: rows.map((row) => ({
        playerId: row.playerId,
        displayName: row.displayName,
        mainPosition: row.application.mainPosition,
        subPositions: row.application.subPositions,
      })),
    };
  }

  async createSeason(envelope: CommandEnvelope, input: CreateSeasonInput, now: Date) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const id = randomUUID();
      const rows = await transaction
        .insert(seasons)
        .values({
          id,
          name: input.name,
          nameNormalized: normalizedSeasonIdentity(input.name),
          applicationsOpenAt: input.applicationsOpenAt,
          applicationsCloseAt: input.applicationsCloseAt,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdByUserAccountId: envelope.actorUserAccountId,
          updatedByUserAccountId: envelope.actorUserAccountId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const created = rows[0]!;
      const body = { season: publicSeason(created, now), revision: created.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_CREATED",
        targetType: "SEASON",
        targetId: created.id,
        before: null,
        after: seasonAuditSnapshot(created),
      });
      return { body, status: 201, revision: created.revision };
    });
  }

  async updateSeason(envelope: CommandEnvelope, input: UpdateSeasonInput, now: Date) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction.select().from(seasons).where(eq(seasons.id, input.id)).for("update").limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
      if (current.revision !== input.expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      }
      if (current.status === "ENDED" || current.status === "RETIRED") {
        throw new SeasonServiceError("INVALID_TRANSITION", "종료되거나 보관된 시즌은 편집할 수 없습니다.");
      }
      const rows = await transaction
        .update(seasons)
        .set({
          name: input.name,
          nameNormalized: normalizedSeasonIdentity(input.name),
          applicationsOpenAt: input.applicationsOpenAt,
          applicationsCloseAt: input.applicationsCloseAt,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          revision: sql`${seasons.revision} + 1`,
          updatedByUserAccountId: envelope.actorUserAccountId,
          updatedAt: now,
        })
        .where(and(eq(seasons.id, input.id), eq(seasons.revision, input.expectedRevision)))
        .returning();
      const updated = rows[0];
      if (!updated) throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      const body = { season: publicSeason(updated, now), revision: updated.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_UPDATED",
        targetType: "SEASON",
        targetId: updated.id,
        before: seasonAuditSnapshot(current),
        after: seasonAuditSnapshot(updated),
      });
      return { body, status: 200, revision: updated.revision };
    });
  }

  async activateSeason(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction.select().from(seasons).where(eq(seasons.id, id)).for("update").limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      }
      if (current.status !== "DRAFT") {
        throw new SeasonServiceError("INVALID_TRANSITION", "초안 시즌만 활성화할 수 있습니다.");
      }
      const activeRows = await transaction
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.status, "ACTIVE"))
        .limit(1);
      if (activeRows.length) {
        throw new SeasonServiceError("ACTIVE_SEASON_EXISTS", "기존 활성 시즌을 먼저 종료해 주세요.");
      }
      const rows = await transaction
        .update(seasons)
        .set({
          status: "ACTIVE",
          activatedAt: now,
          revision: sql`${seasons.revision} + 1`,
          updatedByUserAccountId: envelope.actorUserAccountId,
          updatedAt: now,
        })
        .where(and(eq(seasons.id, id), eq(seasons.revision, expectedRevision), eq(seasons.status, "DRAFT")))
        .returning();
      const updated = rows[0];
      if (!updated) throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 상태가 변경되었습니다.");
      const body = { season: publicSeason(updated, now), revision: updated.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_ACTIVATED",
        targetType: "SEASON",
        targetId: id,
        before: seasonAuditSnapshot(current),
        after: seasonAuditSnapshot(updated),
      });
      return { body, status: 200, revision: updated.revision };
    });
  }

  async endSeason(envelope: CommandEnvelope, id: string, expectedRevision: number, now: Date) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction.select().from(seasons).where(eq(seasons.id, id)).for("update").limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      }
      if (current.status !== "ACTIVE") {
        throw new SeasonServiceError("INVALID_TRANSITION", "활성 시즌만 종료할 수 있습니다.");
      }
      const rows = await transaction
        .update(seasons)
        .set({
          status: "ENDED",
          endedAt: now,
          revision: sql`${seasons.revision} + 1`,
          updatedByUserAccountId: envelope.actorUserAccountId,
          updatedAt: now,
        })
        .where(and(eq(seasons.id, id), eq(seasons.revision, expectedRevision), eq(seasons.status, "ACTIVE")))
        .returning();
      const updated = rows[0];
      if (!updated) throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 상태가 변경되었습니다.");
      const body = { season: publicSeason(updated, now), revision: updated.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_ENDED",
        targetType: "SEASON",
        targetId: id,
        before: seasonAuditSnapshot(current),
        after: seasonAuditSnapshot(updated),
      });
      return { body, status: 200, revision: updated.revision };
    });
  }

  async cloneSeason(
    envelope: CommandEnvelope,
    id: string,
    name: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const sourceRows = await transaction
        .select()
        .from(seasons)
        .where(eq(seasons.id, id))
        .for("update")
        .limit(1);
      const source = sourceRows[0];
      if (!source || source.status === "RETIRED") {
        throw new SeasonServiceError("NOT_FOUND", "복제할 시즌을 찾을 수 없습니다.");
      }
      if (source.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      }
      const baseName = name || `${source.name} 복제본`;
      let candidate = baseName;
      for (let suffix = 2; suffix <= 100; suffix += 1) {
        const duplicateRows = await transaction
          .select({ id: seasons.id })
          .from(seasons)
          .where(eq(seasons.nameNormalized, normalizedSeasonIdentity(candidate)))
          .limit(1);
        if (!duplicateRows.length) break;
        candidate = `${baseName} ${suffix}`;
      }
      if (candidate.length > 120) {
        throw new SeasonServiceError("INVALID_INPUT", "복제 시즌 이름이 너무 깁니다.");
      }
      const newId = randomUUID();
      const rows = await transaction
        .insert(seasons)
        .values({
          id: newId,
          name: candidate,
          nameNormalized: normalizedSeasonIdentity(candidate),
          applicationsOpenAt: source.applicationsOpenAt,
          applicationsCloseAt: source.applicationsCloseAt,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
          clonedFromSeasonId: source.id,
          createdByUserAccountId: envelope.actorUserAccountId,
          updatedByUserAccountId: envelope.actorUserAccountId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const cloned = rows[0]!;
      const body = { season: publicSeason(cloned, now), revision: cloned.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_CLONED",
        targetType: "SEASON",
        targetId: cloned.id,
        before: null,
        after: seasonAuditSnapshot(cloned),
        metadata: { clonedFromSeasonId: source.id },
      });
      return { body, status: 201, revision: cloned.revision };
    });
  }

  async retireSeason(envelope: CommandEnvelope, id: string, expectedRevision: number, now: Date) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction.select().from(seasons).where(eq(seasons.id, id)).for("update").limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 revision이 변경되었습니다.");
      }
      if (current.status !== "DRAFT") {
        throw new SeasonServiceError("INVALID_TRANSITION", "참가 이력이 없는 초안 시즌만 보관할 수 있습니다.");
      }
      const applicationRows = await transaction
        .select({ value: count() })
        .from(seasonApplications)
        .where(eq(seasonApplications.seasonId, id));
      if ((applicationRows[0]?.value ?? 0) > 0) {
        throw new SeasonServiceError("INVALID_TRANSITION", "참가 이력이 있는 시즌은 보관할 수 없습니다.");
      }
      const rows = await transaction
        .update(seasons)
        .set({
          status: "RETIRED",
          retiredAt: now,
          revision: sql`${seasons.revision} + 1`,
          updatedByUserAccountId: envelope.actorUserAccountId,
          updatedAt: now,
        })
        .where(and(eq(seasons.id, id), eq(seasons.revision, expectedRevision), eq(seasons.status, "DRAFT")))
        .returning();
      const retired = rows[0];
      if (!retired) throw new SeasonServiceError("PRECONDITION_FAILED", "시즌 상태가 변경되었습니다.");
      const body = { retired: true, seasonId: id, revision: retired.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_RETIRED",
        targetType: "SEASON",
        targetId: id,
        before: seasonAuditSnapshot(current),
        after: seasonAuditSnapshot(retired),
      });
      return { body, status: 200, revision: retired.revision };
    });
  }

  private async activeSeasonForUpdate(transaction: V2Transaction, now: Date) {
    const rows = await transaction.select().from(seasons).where(eq(seasons.status, "ACTIVE")).for("update").limit(1);
    const season = rows[0];
    if (!season) throw new SeasonServiceError("NO_ACTIVE_SEASON", "현재 활성 시즌이 없습니다.");
    if (!seasonAcceptsApplications(season, now)) {
      throw new SeasonServiceError("APPLICATION_CLOSED", "현재 시즌 참가 신청 기간이 아닙니다.");
    }
    return season;
  }

  private async actorPlayerForUpdate(transaction: V2Transaction, actorUserAccountId: string) {
    const accountRows = await transaction
      .select({ id: userAccounts.id })
      .from(userAccounts)
      .where(
        and(
          eq(userAccounts.id, actorUserAccountId),
          eq(userAccounts.status, "APPROVED"),
          isNull(userAccounts.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!accountRows[0]) {
      throw new SeasonServiceError("FORBIDDEN", "승인된 계정만 참가 신청할 수 있습니다.");
    }
    const playerRows = await transaction
      .select()
      .from(players)
      .where(and(eq(players.userAccountId, actorUserAccountId), eq(players.status, "ACTIVE")))
      .for("update")
      .limit(1);
    if (!playerRows[0]) {
      throw new SeasonServiceError("PLAYER_REQUIRED", "연결된 활성 플레이어가 필요합니다.");
    }
    return playerRows[0];
  }

  private async assertRecruitRoundExists(
    transaction: V2Transaction,
    seasonId: string,
    applyDate: string,
    recruitNo: number,
  ) {
    if (recruitNo === 1) return;
    const [applicationRows, pendingRows] = await Promise.all([
      transaction.select({ id: seasonApplications.id }).from(seasonApplications).where(and(
        eq(seasonApplications.seasonId, seasonId),
        eq(seasonApplications.applyDate, applyDate),
        eq(seasonApplications.recruitNo, recruitNo),
        inArray(seasonApplications.status, ["APPLIED", "RESERVE", "CONFIRMED"]),
      )).limit(1),
      transaction.select({ id: seasonKakaoPendingApplications.id }).from(seasonKakaoPendingApplications).where(and(
        eq(seasonKakaoPendingApplications.seasonId, seasonId),
        eq(seasonKakaoPendingApplications.applyDate, applyDate),
        eq(seasonKakaoPendingApplications.recruitNo, recruitNo),
        eq(seasonKakaoPendingApplications.status, "ACTIVE"),
      )).limit(1),
    ]);
    if (!applicationRows[0] && !pendingRows[0]) {
      throw new SeasonServiceError("INVALID_INPUT", "Kakao에서 시작되지 않은 추가 모집 회차입니다.");
    }
  }

  async upsertOwnApplication(
    envelope: CommandEnvelope,
    input: UpsertOwnApplicationInput,
    now: Date,
  ) {
    return this.idempotent(envelope, "APPROVED_ACCOUNT_MUTATION", async (transaction) => {
      const season = await this.activeSeasonForUpdate(transaction, now);
      const player = await this.actorPlayerForUpdate(transaction, input.actorUserAccountId);
      await this.assertRecruitRoundExists(transaction, season.id, input.applyDate, input.recruitNo);
      const currentRows = await transaction
        .select()
        .from(seasonApplications)
        .where(
          and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.playerId, player.id),
            eq(seasonApplications.applyDate, input.applyDate),
            eq(seasonApplications.recruitNo, input.recruitNo),
          ),
        )
        .for("update")
        .limit(1);
      const current = currentRows[0];
      const mergePlan = planSiteApplicationMerge(current ?? null);

      if (!current) {
        if (input.expectedRevision !== 0) {
          throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
        }
        const rows = await transaction
          .insert(seasonApplications)
          .values({
            id: randomUUID(),
            seasonId: season.id,
            playerId: player.id,
            applyDate: input.applyDate,
            recruitNo: input.recruitNo,
            mainPosition: input.mainPosition,
            subPositions: [...input.subPositions],
            status: "APPLIED",
            source: "SITE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const created = rows[0]!;
        const body = publicApplicationBody(created);
        await this.auditWriter.append(transaction, {
          requestId: envelope.requestId,
          actorUserAccountId: envelope.actorUserAccountId,
          action: "SEASON_APPLICATION_UPSERTED",
          targetType: "SEASON_APPLICATION",
          targetId: created.id,
          before: null,
          after: applicationAuditSnapshot(created),
          metadata: { mergePolicy: SEASON_APPLICATION_MERGE_POLICY, outcome: mergePlan.outcome },
        });
        return { body, status: 201, revision: created.revision };
      }

      if (current.revision !== input.expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      }
      if (mergePlan.action === "PRESERVE_REVIEW") {
        throw new SeasonServiceError("APPLICATION_REVIEWED", "관리자 검토가 끝난 신청은 수정할 수 없습니다.");
      }
      const rows = await transaction
        .update(seasonApplications)
        .set({
          mainPosition: input.mainPosition,
          subPositions: [...input.subPositions],
          status: "APPLIED",
          reviewNote: null,
          reviewedAt: null,
          reviewedByUserAccountId: null,
          cancelledAt: null,
          source: "SITE",
          sourceSlotNo: null,
          sourceReferenceHash: null,
          revision: sql`${seasonApplications.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(seasonApplications.id, current.id),
            eq(seasonApplications.revision, input.expectedRevision),
          ),
        )
        .returning();
      const updated = rows[0];
      if (!updated) throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      const body = publicApplicationBody(updated);
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_APPLICATION_UPSERTED",
        targetType: "SEASON_APPLICATION",
        targetId: updated.id,
        before: applicationAuditSnapshot(current),
        after: applicationAuditSnapshot(updated),
        metadata: {
          mergePolicy: SEASON_APPLICATION_MERGE_POLICY,
          outcome: mergePlan.outcome,
          previousSource: current.source,
        },
      });
      return { body, status: 200, revision: updated.revision };
    });
  }

  async cancelOwnApplication(
    envelope: CommandEnvelope,
    expectedRevision: number,
    applyDate: string,
    recruitNo: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "APPROVED_ACCOUNT_MUTATION", async (transaction) => {
      const season = await this.activeSeasonForUpdate(transaction, now);
      const player = await this.actorPlayerForUpdate(transaction, envelope.actorUserAccountId);
      await this.assertRecruitRoundExists(transaction, season.id, applyDate, recruitNo);
      const currentRows = await transaction
        .select()
        .from(seasonApplications)
        .where(
          and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.playerId, player.id),
            eq(seasonApplications.applyDate, applyDate),
            eq(seasonApplications.recruitNo, recruitNo),
          ),
        )
        .for("update")
        .limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "본인의 오늘 신청을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      }
      if (current.status !== "APPLIED") {
        throw new SeasonServiceError("INVALID_TRANSITION", "접수 상태의 신청만 본인이 취소할 수 있습니다.");
      }
      const rows = await transaction
        .update(seasonApplications)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          revision: sql`${seasonApplications.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(seasonApplications.id, current.id),
            eq(seasonApplications.revision, expectedRevision),
          ),
        )
        .returning();
      const cancelled = rows[0];
      if (!cancelled) throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      const body = publicApplicationBody(cancelled);
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_APPLICATION_CANCELLED",
        targetType: "SEASON_APPLICATION",
        targetId: cancelled.id,
        before: applicationAuditSnapshot(current),
        after: applicationAuditSnapshot(cancelled),
      });
      return { body, status: 200, revision: cancelled.revision };
    });
  }

  async reviewApplication(
    envelope: CommandEnvelope,
    input: ReviewApplicationInput,
    now: Date,
  ) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction
        .select()
        .from(seasonApplications)
        .where(eq(seasonApplications.id, input.id))
        .for("update")
        .limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "참가 신청을 찾을 수 없습니다.");
      if (current.revision !== input.expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      }
      if (current.status === "CANCELLED") {
        throw new SeasonServiceError("INVALID_TRANSITION", "취소된 신청은 검토할 수 없습니다.");
      }
      const rows = await transaction
        .update(seasonApplications)
        .set({
          status: input.status,
          reviewNote: input.reviewNote,
          reviewedByUserAccountId: envelope.actorUserAccountId,
          reviewedAt: now,
          cancelledAt: null,
          revision: sql`${seasonApplications.revision} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(seasonApplications.id, input.id),
            eq(seasonApplications.revision, input.expectedRevision),
          ),
        )
        .returning();
      const reviewed = rows[0];
      if (!reviewed) throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      const body = { applicationId: reviewed.id, status: reviewed.status, revision: reviewed.revision };
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_APPLICATION_REVIEWED",
        targetType: "SEASON_APPLICATION",
        targetId: reviewed.id,
        before: applicationAuditSnapshot(current),
        after: applicationAuditSnapshot(reviewed),
      });
      return { body, status: 200, revision: reviewed.revision };
    });
  }

  async resolveKakaoPendingApplication(
    envelope: CommandEnvelope,
    input: ResolveKakaoPendingInput,
    now: Date,
  ) {
    return this.idempotent(envelope, "SUPER_ADMIN_MUTATION", async (transaction) => {
      const pendingRows = await transaction
        .select()
        .from(seasonKakaoPendingApplications)
        .where(eq(seasonKakaoPendingApplications.id, input.id))
        .for("update")
        .limit(1);
      const pending = pendingRows[0];
      if (!pending) throw new SeasonServiceError("NOT_FOUND", "Kakao 보류 신청을 찾을 수 없습니다.");
      if (pending.revision !== input.expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "보류 신청 revision이 변경되었습니다.");
      }
      if (pending.status !== "ACTIVE") {
        throw new SeasonServiceError("INVALID_TRANSITION", "처리 대기 중인 Kakao 신청만 해결할 수 있습니다.");
      }
      if (pending.matchedPlayerId && pending.matchedPlayerId !== input.playerId) {
        throw new SeasonServiceError("INVALID_INPUT", "자동 일치된 예비 신청은 해당 플레이어로만 해결할 수 있습니다.");
      }
      const playerRows = await transaction
        .select()
        .from(players)
        .where(and(eq(players.id, input.playerId), eq(players.status, "ACTIVE")))
        .for("update")
        .limit(1);
      if (!playerRows[0]) throw new SeasonServiceError("NOT_FOUND", "연결할 활성 플레이어를 찾을 수 없습니다.");

      const existingRows = await transaction
        .select()
        .from(seasonApplications)
        .where(and(
          eq(seasonApplications.seasonId, pending.seasonId),
          eq(seasonApplications.playerId, input.playerId),
          eq(seasonApplications.applyDate, pending.applyDate),
          eq(seasonApplications.recruitNo, pending.recruitNo),
        ))
        .for("update")
        .limit(1);
      const existing = existingRows[0] ?? null;
      const plan = planSeasonApplicationMerge(existing);
      let application = existing;
      if (plan.action === "CREATE_KAKAO") {
        const createdRows = await transaction.insert(seasonApplications).values({
          id: randomUUID(),
          seasonId: pending.seasonId,
          playerId: input.playerId,
          applyDate: pending.applyDate,
          recruitNo: pending.recruitNo,
          sourceSlotNo: pending.slotNo,
          mainPosition: pending.mainPosition,
          subPositions: pending.subPositions,
          status: input.applicationStatus,
          source: "KAKAO",
          sourceReferenceHash: pending.sourceReferenceHash,
          reviewedByUserAccountId: input.applicationStatus === "RESERVE" ? envelope.actorUserAccountId : null,
          reviewedAt: input.applicationStatus === "RESERVE" ? now : null,
          createdAt: now,
          updatedAt: now,
        }).returning();
        application = createdRows[0]!;
      } else if (plan.action === "REFRESH_KAKAO") {
        const refreshedRows = await transaction.update(seasonApplications).set({
          sourceSlotNo: pending.slotNo,
          mainPosition: pending.mainPosition,
          subPositions: pending.subPositions,
          status: input.applicationStatus,
          sourceReferenceHash: pending.sourceReferenceHash,
          reviewNote: null,
          reviewedByUserAccountId: input.applicationStatus === "RESERVE" ? envelope.actorUserAccountId : null,
          reviewedAt: input.applicationStatus === "RESERVE" ? now : null,
          cancelledAt: null,
          revision: sql`${seasonApplications.revision} + 1`,
          updatedAt: now,
        }).where(and(eq(seasonApplications.id, existing!.id), eq(seasonApplications.revision, existing!.revision))).returning();
        application = refreshedRows[0];
        if (!application) throw new SeasonServiceError("PRECONDITION_FAILED", "연결 대상 신청이 변경되었습니다.");
      }

      const resolvedRows = await transaction.update(seasonKakaoPendingApplications).set({
        status: "RESOLVED",
        resolvedAt: now,
        cancelledAt: null,
        revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
        updatedAt: now,
      }).where(and(
        eq(seasonKakaoPendingApplications.id, pending.id),
        eq(seasonKakaoPendingApplications.revision, input.expectedRevision),
        eq(seasonKakaoPendingApplications.status, "ACTIVE"),
      )).returning();
      const resolved = resolvedRows[0];
      if (!resolved || !application) throw new SeasonServiceError("PRECONDITION_FAILED", "보류 신청 상태가 변경되었습니다.");

      if (plan.action !== "PRESERVE") {
        await this.auditWriter.append(transaction, {
          requestId: envelope.requestId,
          actorUserAccountId: envelope.actorUserAccountId,
          action: "SEASON_KAKAO_APPLICATION_MERGED",
          targetType: "SEASON_APPLICATION",
          targetId: application.id,
          before: existing ? applicationAuditSnapshot(existing) : null,
          after: applicationAuditSnapshot(application),
          metadata: { pendingApplicationId: pending.id, mergePolicy: "SITE_AND_REVIEWED_DECISIONS_WIN", outcome: plan.outcome },
        });
      }
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_KAKAO_PENDING_RESOLVED",
        targetType: "SEASON_KAKAO_PENDING_APPLICATION",
        targetId: resolved.id,
        before: pendingAuditSnapshot(pending),
        after: pendingAuditSnapshot(resolved),
        metadata: { playerId: input.playerId, applicationId: application.id, mergePolicy: "SITE_AND_REVIEWED_DECISIONS_WIN", outcome: plan.outcome },
      });
      return {
        body: {
          pendingApplicationId: resolved.id,
          applicationId: application.id,
          pendingStatus: resolved.status,
          applicationStatus: application.status,
          mergeOutcome: plan.outcome,
          revision: resolved.revision,
        },
        status: 200,
        revision: resolved.revision,
      };
    });
  }

  async cancelKakaoPendingApplication(
    envelope: CommandEnvelope,
    id: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "SUPER_ADMIN_MUTATION", async (transaction) => {
      const currentRows = await transaction.select().from(seasonKakaoPendingApplications)
        .where(eq(seasonKakaoPendingApplications.id, id)).for("update").limit(1);
      const current = currentRows[0];
      if (!current) throw new SeasonServiceError("NOT_FOUND", "Kakao 보류 신청을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "보류 신청 revision이 변경되었습니다.");
      }
      if (current.status !== "ACTIVE") {
        throw new SeasonServiceError("INVALID_TRANSITION", "처리 대기 중인 Kakao 신청만 취소할 수 있습니다.");
      }
      const cancelledRows = await transaction.update(seasonKakaoPendingApplications).set({
        status: "CANCELLED",
        cancelledAt: now,
        resolvedAt: null,
        revision: sql`${seasonKakaoPendingApplications.revision} + 1`,
        updatedAt: now,
      }).where(and(
        eq(seasonKakaoPendingApplications.id, id),
        eq(seasonKakaoPendingApplications.revision, expectedRevision),
        eq(seasonKakaoPendingApplications.status, "ACTIVE"),
      )).returning();
      const cancelled = cancelledRows[0];
      if (!cancelled) throw new SeasonServiceError("PRECONDITION_FAILED", "보류 신청 상태가 변경되었습니다.");
      await this.auditWriter.append(transaction, {
        requestId: envelope.requestId,
        actorUserAccountId: envelope.actorUserAccountId,
        action: "SEASON_KAKAO_PENDING_CANCELLED",
        targetType: "SEASON_KAKAO_PENDING_APPLICATION",
        targetId: cancelled.id,
        before: pendingAuditSnapshot(current),
        after: pendingAuditSnapshot(cancelled),
      });
      return {
        body: { pendingApplicationId: cancelled.id, status: cancelled.status, revision: cancelled.revision },
        status: 200,
        revision: cancelled.revision,
      };
    });
  }
}
