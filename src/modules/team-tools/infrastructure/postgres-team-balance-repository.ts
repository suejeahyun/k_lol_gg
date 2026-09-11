import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { matchSubmissions } from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import {
  teamBalanceCommandReceipts,
  teamBalanceDraftCandidates,
  teamBalanceDraftParticipants,
  teamBalanceDrafts,
  teamBalanceOutbox,
} from "@/platform/db/schema/team-tools";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  CreateTeamBalanceDraftInput,
  SelectTeamBalanceCandidateInput,
  TeamBalanceCommandEnvelope,
  TeamBalanceDraftListQuery,
  TeamBalanceMutationResult,
  TeamBalanceRepository,
  TeamBalanceViewer,
} from "../application/ports/team-balance-repository";
import type { TeamBalanceRatingProvider } from "../application/ports/team-balance-rating-provider";
import {
  calculateTeamBalanceCandidates,
  evaluateTeamBalanceLayout,
  type EvaluatedTeamBalanceLayout,
  type TeamBalanceEligibility,
  type TeamBalancePlayer,
  type TeamBalanceRatingProviderDto,
} from "../domain/team-balance";
import {
  TEAM_BALANCE_DRAFT_RECEIPT_TTL_MS,
  TeamBalanceServiceError,
  automaticTeamBalanceCriterion,
  type TeamBalanceCandidateCriterion,
  type TeamBalanceDraft,
  type TeamBalanceDraftCandidate,
  type TeamBalanceDraftParticipant,
} from "../domain/team-balance-draft";
import { PostgresTeamBalanceRatingProvider } from "./postgres-team-balance-rating-provider";

type DraftRow = typeof teamBalanceDrafts.$inferSelect;
type SuccessfulMutation = Omit<TeamBalanceMutationResult, "replayed">;

const nullRating: TeamBalanceRatingProviderDto = {
  overall: null,
  confidence: null,
  sampleSize: null,
  positions: null,
};

function postgresDetails(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code && /^[0-9A-Z]{5}$/u.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return {};
}

function rethrowConflict(error: unknown): never {
  const details = postgresDetails(error);
  if (details.code === "23505") {
    throw new TeamBalanceServiceError("INVALID_TRANSITION", "같은 팀 배치가 이미 저장되었습니다.");
  }
  throw error;
}

function draftSnapshot(row: DraftRow): Record<string, unknown> {
  return {
    ownerUserAccountId: row.ownerUserAccountId,
    title: row.title,
    status: row.status,
    evaluationRound: row.evaluationRound,
    ratingGeneration: row.ratingGeneration,
    selectedCandidateSource: row.selectedCandidateSource,
    selectedCandidateSignature: row.selectedCandidateSignature,
    revision: row.revision,
  };
}

async function existingReceipt(
  executor: DatabaseExecutor,
  envelope: TeamBalanceCommandEnvelope,
): Promise<TeamBalanceMutationResult | null> {
  const receipt = (
    await executor
      .select()
      .from(teamBalanceCommandReceipts)
      .where(
        and(
          eq(teamBalanceCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
          eq(teamBalanceCommandReceipts.scope, envelope.scope),
          eq(teamBalanceCommandReceipts.keyHash, envelope.keyHash),
          sql<boolean>`${teamBalanceCommandReceipts.expiresAt} > clock_timestamp()`,
        ),
      )
      .limit(1)
  )[0];
  if (!receipt) return null;
  if (!Buffer.from(receipt.requestHash).equals(envelope.requestHash)) {
    throw new TeamBalanceServiceError("IDEMPOTENCY_MISMATCH", "같은 멱등성 키가 다른 요청에 사용되었습니다.");
  }
  const revision = receipt.responseJson.revision;
  if (typeof revision !== "number") throw new Error("Stored team-balance receipt has no revision.");
  return {
    body: receipt.responseJson,
    status: receipt.responseStatus,
    revision,
    replayed: true,
  };
}

function assertDraftAccess(row: DraftRow, authorization: TeamBalanceCommandEnvelope["authorization"], actorId: string) {
  if (authorization === "APPROVED_ACCOUNT_MUTATION" && row.ownerUserAccountId !== actorId) {
    throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
  }
}

function assertViewerAccess(row: DraftRow, viewer: TeamBalanceViewer) {
  if (
    viewer.authorization === "OWNER" &&
    (row.ownerUserAccountId !== viewer.actorUserAccountId || row.status === "ARCHIVED")
  ) {
    throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
  }
}

function participantFromRow(row: typeof teamBalanceDraftParticipants.$inferSelect): TeamBalanceDraftParticipant {
  return {
    playerId: row.playerId,
    displayName: row.displayNameSnapshot,
    ordinal: row.ordinal,
    eligiblePositions: row.eligiblePositionsJson as unknown as readonly TeamBalanceEligibility[],
    rating: row.ratingSnapshotJson as unknown as TeamBalanceRatingProviderDto,
  };
}

function candidateFromRow(row: typeof teamBalanceDraftCandidates.$inferSelect): TeamBalanceDraftCandidate {
  const storedCriterion = (row.scoreJson as { criterion?: unknown }).criterion;
  const score = { ...row.scoreJson };
  delete score.criterion;
  const criterion: TeamBalanceCandidateCriterion = row.source === "MANUAL"
    ? "MANUAL"
    : storedCriterion === "V1_AI_GLOBAL" || storedCriterion === "OVERALL_BALANCE" || storedCriterion === "POSITION_BALANCE" || storedCriterion === "PREFERENCE_PRIORITY"
      ? storedCriterion
      : "LEGACY";
  return {
    id: row.id,
    evaluationRound: row.evaluationRound,
    source: row.source,
    rank: row.rank,
    criterion,
    signature: row.signature,
    assignments: row.assignmentsJson as unknown as EvaluatedTeamBalanceLayout["assignments"],
    score: score as unknown as EvaluatedTeamBalanceLayout["score"],
  };
}

async function appendEvidence(
  transaction: V2Transaction,
  envelope: TeamBalanceCommandEnvelope,
  action: string,
  before: Record<string, unknown> | null,
  after: DraftRow,
) {
  await transaction.insert(auditEvents).values({
    requestId: envelope.requestId,
    actorUserAccountId: envelope.actorUserAccountId,
    action,
    targetType: "TEAM_BALANCE_DRAFT",
    targetId: after.id,
    beforeJson: before,
    afterJson: draftSnapshot(after),
  });
  await transaction.insert(teamBalanceOutbox).values({
    id: randomUUID(),
    draftId: after.id,
    draftRevision: after.revision,
    requestId: envelope.requestId,
    eventType: action,
    payloadJson: {
      draftId: after.id,
      revision: after.revision,
      status: after.status,
      evaluationRound: after.evaluationRound,
    },
  });
}

function evaluatedCandidatesValues(
  draftId: string,
  evaluationRound: number,
  actorUserAccountId: string,
  candidates: readonly (EvaluatedTeamBalanceLayout & { rank: number })[],
  now: Date,
) {
  return candidates.map((candidate) => ({
    id: randomUUID(),
    draftId,
    evaluationRound,
    source: "AUTO" as const,
    rank: candidate.rank,
    signature: candidate.signature,
    assignmentsJson: candidate.assignments,
    scoreJson: { ...candidate.score, criterion: automaticTeamBalanceCriterion(candidate.rank) },
    createdByUserAccountId: actorUserAccountId,
    createdAt: now,
  }));
}

export class PostgresTeamBalanceRepository implements TeamBalanceRepository {
  constructor(
    private readonly database: V2Database,
    private readonly ratingProvider: TeamBalanceRatingProvider = new PostgresTeamBalanceRatingProvider(),
  ) {}

  private async idempotent(
    envelope: TeamBalanceCommandEnvelope,
    requiredAuthorization: TeamBalanceCommandEnvelope["authorization"] | "EITHER",
    work: (transaction: V2Transaction) => Promise<SuccessfulMutation>,
  ): Promise<TeamBalanceMutationResult> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (
          (requiredAuthorization !== "EITHER" && envelope.authorization !== requiredAuthorization) ||
          envelope.actorUserAccountId !== envelope.actorSession.userAccountId
        ) {
          throw new TeamBalanceServiceError("FORBIDDEN", "이 명령에 허용되지 않은 세션입니다.");
        }
        const policy = envelope.authorization === "ADMIN_MUTATION"
          ? ADMIN_MUTATION_SESSION_POLICY
          : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
        if (!(await lockTransactionSessionActor(transaction, envelope.actorSession, new Date(), policy))) {
          throw new TeamBalanceServiceError("SESSION_STALE", "로그인 세션이 더 이상 유효하지 않습니다.");
        }

        const lockKey = `${envelope.actorUserAccountId}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
        await transaction.delete(teamBalanceCommandReceipts).where(
          and(
            eq(teamBalanceCommandReceipts.actorUserAccountId, envelope.actorUserAccountId),
            eq(teamBalanceCommandReceipts.scope, envelope.scope),
            eq(teamBalanceCommandReceipts.keyHash, envelope.keyHash),
            sql<boolean>`${teamBalanceCommandReceipts.expiresAt} <= clock_timestamp()`,
          ),
        );
        const replay = await existingReceipt(transaction, envelope);
        if (replay) return replay;
        const receiptId = randomUUID();
        await transaction.insert(teamBalanceCommandReceipts).values({
          id: receiptId,
          actorUserAccountId: envelope.actorUserAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { pending: true },
          createdAt: sql`clock_timestamp()`,
          expiresAt: sql`clock_timestamp() + (${TEAM_BALANCE_DRAFT_RECEIPT_TTL_MS} * interval '1 millisecond')`,
        });
        const result = await work(transaction);
        await transaction
          .update(teamBalanceCommandReceipts)
          .set({
            responseStatus: result.status,
            responseJson: result.body,
            responseEtag: `"${result.revision}"`,
          })
          .where(eq(teamBalanceCommandReceipts.id, receiptId));
        return { ...result, replayed: false };
      });
    } catch (error) {
      rethrowConflict(error);
    }
  }

  async listDrafts(viewer: TeamBalanceViewer, query: TeamBalanceDraftListQuery) {
    const predicate = viewer.authorization === "OWNER"
      ? and(
          eq(teamBalanceDrafts.ownerUserAccountId, viewer.actorUserAccountId),
          inArray(teamBalanceDrafts.status, ["EVALUATED", "SAVED"]),
        )
      : undefined;
    const totalRows = await this.database
      .select({ value: count() })
      .from(teamBalanceDrafts)
      .where(predicate);
    const totalCount = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const currentPage = Math.min(query.page, totalPages);
    const rows = await this.database
      .select({
        id: teamBalanceDrafts.id,
        title: teamBalanceDrafts.title,
        status: teamBalanceDrafts.status,
        evaluationRound: teamBalanceDrafts.evaluationRound,
        ratingGeneration: teamBalanceDrafts.ratingGeneration,
        revision: teamBalanceDrafts.revision,
        createdAt: teamBalanceDrafts.createdAt,
        updatedAt: teamBalanceDrafts.updatedAt,
        participantCount: count(teamBalanceDraftParticipants.playerId),
      })
      .from(teamBalanceDrafts)
      .leftJoin(
        teamBalanceDraftParticipants,
        eq(teamBalanceDraftParticipants.draftId, teamBalanceDrafts.id),
      )
      .where(predicate)
      .groupBy(teamBalanceDrafts.id)
      .orderBy(desc(teamBalanceDrafts.updatedAt), desc(teamBalanceDrafts.id))
      .limit(query.pageSize)
      .offset((currentPage - 1) * query.pageSize);
    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      totalCount,
      currentPage,
      totalPages,
      pageSize: query.pageSize,
    };
  }

  async getDraft(viewer: TeamBalanceViewer, draftId: string): Promise<TeamBalanceDraft | null> {
    const row = (
      await this.database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)).limit(1)
    )[0];
    if (!row) return null;
    assertViewerAccess(row, viewer);
    const [participantRows, candidateRows] = await Promise.all([
      this.database
        .select()
        .from(teamBalanceDraftParticipants)
        .where(eq(teamBalanceDraftParticipants.draftId, draftId))
        .orderBy(asc(teamBalanceDraftParticipants.ordinal)),
      this.database
        .select()
        .from(teamBalanceDraftCandidates)
        .where(
          and(
            eq(teamBalanceDraftCandidates.draftId, draftId),
            eq(teamBalanceDraftCandidates.evaluationRound, row.evaluationRound),
          ),
        )
        .orderBy(asc(teamBalanceDraftCandidates.rank), asc(teamBalanceDraftCandidates.signature)),
    ]);
    return {
      id: row.id,
      ownerUserAccountId: row.ownerUserAccountId,
      title: row.title,
      status: row.status,
      evaluationRound: row.evaluationRound,
      ratingGeneration: row.ratingGeneration,
      selectedCandidateSource: row.selectedCandidateSource,
      selectedCandidateSignature: row.selectedCandidateSignature,
      revision: row.revision,
      participants: participantRows.map(participantFromRow),
      candidates: candidateRows.map(candidateFromRow),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createDraft(
    envelope: TeamBalanceCommandEnvelope,
    input: CreateTeamBalanceDraftInput,
    now: Date,
  ) {
    return this.idempotent(envelope, "APPROVED_ACCOUNT_MUTATION", async (transaction) => {
      const playerRows = await transaction
        .select({ id: players.id, nickname: players.nickname })
        .from(players)
        .where(and(inArray(players.id, input.participants.map((item) => item.playerId)), eq(players.status, "ACTIVE")))
        .for("share");
      if (playerRows.length !== 10) {
        throw new TeamBalanceServiceError("NOT_FOUND", "활성 플레이어 10명을 모두 찾을 수 없습니다.");
      }
      const playerById = new Map(playerRows.map((row) => [row.id, row]));
      const ratingSnapshot = await this.ratingProvider.load(transaction, input.participants.map((item) => item.playerId));
      const calculationPlayers: TeamBalancePlayer[] = input.participants.map((participant) => ({
        ...participant,
        rating: ratingSnapshot.ratings.get(participant.playerId) ?? null,
      }));
      const calculation = calculateTeamBalanceCandidates(calculationPlayers);
      const recommendation = calculation.candidates[0]!;
      const id = randomUUID();
      const draft = (
        await transaction
          .insert(teamBalanceDrafts)
          .values({
            id,
            ownerUserAccountId: envelope.actorUserAccountId,
            title: input.title,
            ratingGeneration: ratingSnapshot.generation,
            selectedCandidateSource: "AUTO",
            selectedCandidateSignature: recommendation.signature,
            createdByUserAccountId: envelope.actorUserAccountId,
            updatedByUserAccountId: envelope.actorUserAccountId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0]!;
      await transaction.insert(teamBalanceDraftParticipants).values(
        input.participants.map((participant, ordinal) => ({
          draftId: id,
          playerId: participant.playerId,
          ordinal,
          displayNameSnapshot: playerById.get(participant.playerId)!.nickname,
          eligiblePositionsJson: participant.eligiblePositions,
          ratingSnapshotJson: ratingSnapshot.ratings.get(participant.playerId) ?? nullRating,
          updatedAt: now,
        })),
      );
      await transaction.insert(teamBalanceDraftCandidates).values(
        evaluatedCandidatesValues(id, 1, envelope.actorUserAccountId, calculation.candidates, now),
      );
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_DRAFT_CREATED", null, draft);
      return {
        body: { draftId: id, revision: draft.revision, location: `/tools/team-balance/drafts/${id}` },
        status: 201,
        revision: draft.revision,
      };
    });
  }

  private async lockedDraft(transaction: V2Transaction, envelope: TeamBalanceCommandEnvelope, draftId: string, expectedRevision: number) {
    const row = (
      await transaction.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)).for("update").limit(1)
    )[0];
    if (!row) throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
    assertDraftAccess(row, envelope.authorization, envelope.actorUserAccountId);
    if (row.revision !== expectedRevision) {
      throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
    }
    if (row.status === "ARCHIVED") {
      throw new TeamBalanceServiceError("INVALID_TRANSITION", "보관된 초안은 변경할 수 없습니다.");
    }
    return row;
  }

  private async participantInputs(transaction: V2Transaction, draftId: string): Promise<TeamBalancePlayer[]> {
    const rows = await transaction
      .select()
      .from(teamBalanceDraftParticipants)
      .where(eq(teamBalanceDraftParticipants.draftId, draftId))
      .orderBy(asc(teamBalanceDraftParticipants.ordinal));
    if (rows.length !== 10) throw new TeamBalanceServiceError("INVALID_TRANSITION", "초안 참가자 구성이 손상되었습니다.");
    return rows.map((row) => ({
      playerId: row.playerId,
      eligiblePositions: row.eligiblePositionsJson as unknown as readonly TeamBalanceEligibility[],
      rating: row.ratingSnapshotJson as unknown as TeamBalanceRatingProviderDto,
    }));
  }

  async selectCandidate(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    input: SelectTeamBalanceCandidateInput,
    now: Date,
  ) {
    return this.idempotent(envelope, "EITHER", async (transaction) => {
      const current = await this.lockedDraft(transaction, envelope, draftId, expectedRevision);
      let selected = input.kind === "AUTO"
        ? (
            await transaction
              .select()
              .from(teamBalanceDraftCandidates)
              .where(
                and(
                  eq(teamBalanceDraftCandidates.draftId, draftId),
                  eq(teamBalanceDraftCandidates.evaluationRound, current.evaluationRound),
                  eq(teamBalanceDraftCandidates.source, "AUTO"),
                  eq(teamBalanceDraftCandidates.rank, input.rank),
                ),
              )
              .limit(1)
          )[0]
        : null;

      if (input.kind === "MANUAL") {
        let evaluated: EvaluatedTeamBalanceLayout;
        try {
          evaluated = evaluateTeamBalanceLayout(await this.participantInputs(transaction, draftId), input.layout);
        } catch {
          throw new TeamBalanceServiceError("INVALID_INPUT", "수동 팀 배치의 인원·포지션을 확인해 주세요.");
        }
        selected = (
          await transaction
            .select()
            .from(teamBalanceDraftCandidates)
            .where(
              and(
                eq(teamBalanceDraftCandidates.draftId, draftId),
                eq(teamBalanceDraftCandidates.evaluationRound, current.evaluationRound),
                eq(teamBalanceDraftCandidates.signature, evaluated.signature),
              ),
            )
            .limit(1)
        )[0];
        if (!selected) {
          selected = (
            await transaction
              .insert(teamBalanceDraftCandidates)
              .values({
                id: randomUUID(),
                draftId,
                evaluationRound: current.evaluationRound,
                source: "MANUAL",
                rank: null,
                signature: evaluated.signature,
                assignmentsJson: evaluated.assignments,
                scoreJson: { ...evaluated.score, criterion: "MANUAL" },
                createdByUserAccountId: envelope.actorUserAccountId,
                createdAt: now,
              })
              .returning()
          )[0]!;
        }
      }
      if (!selected) throw new TeamBalanceServiceError("NOT_FOUND", "선택한 팀 배치를 찾을 수 없습니다.");

      const updated = (
        await transaction
          .update(teamBalanceDrafts)
          .set({
            status: "EVALUATED",
            selectedCandidateSource: selected.source,
            selectedCandidateSignature: selected.signature,
            savedAt: null,
            revision: sql`${teamBalanceDrafts.revision} + 1`,
            updatedByUserAccountId: envelope.actorUserAccountId,
            updatedAt: now,
          })
          .where(and(eq(teamBalanceDrafts.id, draftId), eq(teamBalanceDrafts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_CANDIDATE_SELECTED", draftSnapshot(current), updated);
      return {
        body: { draftId, revision: updated.revision, selectedCandidateSignature: selected.signature },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async saveDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "EITHER", async (transaction) => {
      const current = await this.lockedDraft(transaction, envelope, draftId, expectedRevision);
      if (current.status !== "EVALUATED" || !current.selectedCandidateSignature) {
        throw new TeamBalanceServiceError("INVALID_TRANSITION", "추천 또는 수동 팀 배치가 적용된 평가 상태에서만 저장할 수 있습니다.");
      }
      const updated = (
        await transaction
          .update(teamBalanceDrafts)
          .set({
            status: "SAVED",
            savedAt: now,
            revision: sql`${teamBalanceDrafts.revision} + 1`,
            updatedByUserAccountId: envelope.actorUserAccountId,
            updatedAt: now,
          })
          .where(and(eq(teamBalanceDrafts.id, draftId), eq(teamBalanceDrafts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_DRAFT_SAVED", draftSnapshot(current), updated);
      return { body: { draftId, revision: updated.revision, saved: true }, status: 200, revision: updated.revision };
    });
  }

  async reevaluateDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "EITHER", async (transaction) => {
      const current = await this.lockedDraft(transaction, envelope, draftId, expectedRevision);
      const participantRows = await transaction
        .select()
        .from(teamBalanceDraftParticipants)
        .where(eq(teamBalanceDraftParticipants.draftId, draftId))
        .orderBy(asc(teamBalanceDraftParticipants.ordinal));
      if (participantRows.length !== 10) throw new TeamBalanceServiceError("INVALID_TRANSITION", "초안 참가자 구성이 손상되었습니다.");
      const ratingSnapshot = await this.ratingProvider.load(transaction, participantRows.map((row) => row.playerId));
      const calculation = calculateTeamBalanceCandidates(
        participantRows.map((row) => ({
          playerId: row.playerId,
          eligiblePositions: row.eligiblePositionsJson as unknown as readonly TeamBalanceEligibility[],
          rating: ratingSnapshot.ratings.get(row.playerId) ?? null,
        })),
      );
      const recommendation = calculation.candidates[0]!;
      const nextRound = current.evaluationRound + 1;
      await transaction.insert(teamBalanceDraftCandidates).values(
        evaluatedCandidatesValues(draftId, nextRound, envelope.actorUserAccountId, calculation.candidates, now),
      );
      for (const participant of participantRows) {
        await transaction
          .update(teamBalanceDraftParticipants)
          .set({
            ratingSnapshotJson: ratingSnapshot.ratings.get(participant.playerId) ?? nullRating,
            updatedAt: now,
          })
          .where(
            and(
              eq(teamBalanceDraftParticipants.draftId, draftId),
              eq(teamBalanceDraftParticipants.playerId, participant.playerId),
            ),
          );
      }
      const updated = (
        await transaction
          .update(teamBalanceDrafts)
          .set({
            status: "EVALUATED",
            evaluationRound: nextRound,
            ratingGeneration: ratingSnapshot.generation,
            selectedCandidateSource: "AUTO",
            selectedCandidateSignature: recommendation.signature,
            savedAt: null,
            revision: sql`${teamBalanceDrafts.revision} + 1`,
            updatedByUserAccountId: envelope.actorUserAccountId,
            updatedAt: now,
          })
          .where(and(eq(teamBalanceDrafts.id, draftId), eq(teamBalanceDrafts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_DRAFT_REEVALUATED", draftSnapshot(current), updated);
      return {
        body: { draftId, revision: updated.revision, evaluationRound: nextRound },
        status: 200,
        revision: updated.revision,
      };
    });
  }

  async archiveDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(teamBalanceDrafts)
          .where(eq(teamBalanceDrafts.id, draftId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      }
      if (current.status === "ARCHIVED") {
        throw new TeamBalanceServiceError("INVALID_TRANSITION", "이미 보관된 초안입니다.");
      }
      const openSubmission = (
        await transaction
          .select({ id: matchSubmissions.id })
          .from(matchSubmissions)
          .where(and(
            eq(matchSubmissions.teamBalanceDraftId, draftId),
            inArray(matchSubmissions.status, ["AWAITING_UPLOAD", "PENDING_REVIEW"]),
          ))
          .for("share")
          .limit(1)
      )[0];
      if (openSubmission) {
        throw new TeamBalanceServiceError("INVALID_TRANSITION", "검토 중인 경기 접수가 있어 초안을 보관할 수 없습니다.");
      }
      const updated = (
        await transaction
          .update(teamBalanceDrafts)
          .set({
            status: "ARCHIVED",
            archivedAt: now,
            revision: sql`${teamBalanceDrafts.revision} + 1`,
            updatedByUserAccountId: envelope.actorUserAccountId,
            updatedAt: now,
          })
          .where(and(eq(teamBalanceDrafts.id, draftId), eq(teamBalanceDrafts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_DRAFT_ARCHIVED", draftSnapshot(current), updated);
      return { body: { draftId, revision: updated.revision, archived: true }, status: 200, revision: updated.revision };
    });
  }

  async restoreDraft(
    envelope: TeamBalanceCommandEnvelope,
    draftId: string,
    expectedRevision: number,
    now: Date,
  ) {
    return this.idempotent(envelope, "ADMIN_MUTATION", async (transaction) => {
      const current = (
        await transaction
          .select()
          .from(teamBalanceDrafts)
          .where(eq(teamBalanceDrafts.id, draftId))
          .for("update")
          .limit(1)
      )[0];
      if (!current) throw new TeamBalanceServiceError("NOT_FOUND", "팀 초안을 찾을 수 없습니다.");
      if (current.revision !== expectedRevision) {
        throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      }
      if (current.status !== "ARCHIVED") {
        throw new TeamBalanceServiceError("INVALID_TRANSITION", "보관된 초안만 복구할 수 있습니다.");
      }
      const restoredStatus = current.savedAt && current.selectedCandidateSignature ? "SAVED" : "EVALUATED";
      const updated = (
        await transaction
          .update(teamBalanceDrafts)
          .set({
            status: restoredStatus,
            archivedAt: null,
            revision: sql`${teamBalanceDrafts.revision} + 1`,
            updatedByUserAccountId: envelope.actorUserAccountId,
            updatedAt: now,
          })
          .where(and(eq(teamBalanceDrafts.id, draftId), eq(teamBalanceDrafts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) throw new TeamBalanceServiceError("PRECONDITION_FAILED", "팀 초안 revision이 변경되었습니다.");
      await appendEvidence(transaction, envelope, "TEAM_BALANCE_DRAFT_RESTORED", draftSnapshot(current), updated);
      return { body: { draftId, revision: updated.revision, restored: true }, status: 200, revision: updated.revision };
    });
  }
}
