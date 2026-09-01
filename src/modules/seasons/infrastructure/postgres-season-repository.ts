import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { auditEvents } from "@/platform/db/schema/audit";
import { userAccounts } from "@/platform/db/schema/auth";
import { players } from "@/platform/db/schema/registry";
import {
  seasonApplications,
  seasonCommandReceipts,
  seasons,
} from "@/platform/db/schema/seasons";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  AdminWorkspaceQuery,
  CommandEnvelope,
  CreateSeasonInput,
  MutationResult,
  ReviewApplicationInput,
  SeasonAuditWriter,
  SeasonRepository,
  UpdateSeasonInput,
  UpsertOwnApplicationInput,
} from "../application/ports/season-repository";
import {
  kstDateKey,
  normalizedSeasonIdentity,
  seasonAcceptsApplications,
  SEASON_COMMAND_RECEIPT_TTL_MS,
  SeasonServiceError,
  type AdminSeason,
  type AdminSeasonApplication,
  type OwnSeasonApplication,
  type PublicSeason,
} from "../domain/season";

type SeasonRow = typeof seasons.$inferSelect;
type ApplicationRow = typeof seasonApplications.$inferSelect;
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
  now: Date,
): Promise<MutationResult<SuccessfulBody> | null> {
  const rows = await database
    .select()
    .from(seasonCommandReceipts)
    .where(
      and(
        eq(seasonCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
        eq(seasonCommandReceipts.scope, envelope.scope),
        eq(seasonCommandReceipts.keyHash, envelope.keyHash),
        gt(seasonCommandReceipts.expiresAt, now),
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
    work: (transaction: V2Transaction) => Promise<Omit<MutationResult<SuccessfulBody>, "replayed">>,
  ): Promise<MutationResult<SuccessfulBody>> {
    const receiptNow = new Date();
    const replay = await existingReceipt(this.database, envelope, receiptNow);
    if (replay) return replay;

    let claimed = false;
    try {
      return await withTransaction(this.database, async (transaction) => {
        await transaction
          .delete(seasonCommandReceipts)
          .where(lte(seasonCommandReceipts.expiresAt, receiptNow));
        await transaction.insert(seasonCommandReceipts).values({
          id: randomUUID(),
          actorUserAccountId: envelope.actorUserAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { pending: true },
          createdAt: receiptNow,
          expiresAt: new Date(receiptNow.getTime() + SEASON_COMMAND_RECEIPT_TTL_MS),
        });
        claimed = true;

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
      const details = postgresDetails(error);
      if (!claimed && details.code === "23505") {
        const concurrentReplay = await existingReceipt(this.database, envelope, new Date());
        if (concurrentReplay) return concurrentReplay;
      }
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

  async getApplicationHub(actorUserAccountId: string | null, now: Date) {
    const today = kstDateKey(now);
    let viewer: "ANONYMOUS" | "RESTRICTED" | "APPROVED" = "ANONYMOUS";
    let applicantPlayerId: string | null = null;
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
          .select({ id: players.id })
          .from(players)
          .where(and(eq(players.userAccountId, actorUserAccountId), eq(players.status, "ACTIVE")))
          .limit(1);
        applicantPlayerId = actorPlayers[0]?.id ?? null;
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
        participantTotal: 0,
        participantsTruncated: false,
      };
    }

    const publicPredicates = and(
      eq(seasonApplications.seasonId, season.id),
      eq(seasonApplications.applyDate, today),
      eq(seasonApplications.recruitNo, 1),
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
            eq(seasonApplications.recruitNo, 1),
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
      participantTotal,
      participantsTruncated: participantTotal > publicRows.length,
    };
  }

  async findOwnApplication(actorUserAccountId: string, now: Date) {
    return (await this.getApplicationHub(actorUserAccountId, now)).myApplication;
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

  async createSeason(envelope: CommandEnvelope, input: CreateSeasonInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
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
    return this.idempotent(envelope, async (transaction) => {
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
    return this.idempotent(envelope, async (transaction) => {
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
    return this.idempotent(envelope, async (transaction) => {
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
    return this.idempotent(envelope, async (transaction) => {
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
    return this.idempotent(envelope, async (transaction) => {
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

  async upsertOwnApplication(
    envelope: CommandEnvelope,
    input: UpsertOwnApplicationInput,
    now: Date,
  ) {
    return this.idempotent(envelope, async (transaction) => {
      const season = await this.activeSeasonForUpdate(transaction, now);
      const player = await this.actorPlayerForUpdate(transaction, input.actorUserAccountId);
      const currentRows = await transaction
        .select()
        .from(seasonApplications)
        .where(
          and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.playerId, player.id),
            eq(seasonApplications.applyDate, input.applyDate),
            eq(seasonApplications.recruitNo, 1),
          ),
        )
        .for("update")
        .limit(1);
      const current = currentRows[0];

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
            recruitNo: 1,
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
        });
        return { body, status: 201, revision: created.revision };
      }

      if (current.revision !== input.expectedRevision) {
        throw new SeasonServiceError("PRECONDITION_FAILED", "신청 revision이 변경되었습니다.");
      }
      if (current.status === "RESERVE" || current.status === "CONFIRMED" || current.status === "REJECTED") {
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
      });
      return { body, status: 200, revision: updated.revision };
    });
  }

  async cancelOwnApplication(
    envelope: CommandEnvelope,
    expectedRevision: number,
    applyDate: string,
    now: Date,
  ) {
    return this.idempotent(envelope, async (transaction) => {
      const season = await this.activeSeasonForUpdate(transaction, now);
      const player = await this.actorPlayerForUpdate(transaction, envelope.actorUserAccountId);
      const currentRows = await transaction
        .select()
        .from(seasonApplications)
        .where(
          and(
            eq(seasonApplications.seasonId, season.id),
            eq(seasonApplications.playerId, player.id),
            eq(seasonApplications.applyDate, applyDate),
            eq(seasonApplications.recruitNo, 1),
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
    return this.idempotent(envelope, async (transaction) => {
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
}
