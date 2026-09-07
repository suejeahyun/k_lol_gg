import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import {
  TeamBalanceService,
  TeamBalanceServiceError,
  type TeamBalanceCommandContext,
  type TeamBalanceRatingProvider,
  type TeamBalanceRatingSnapshot,
} from "../../src/modules/team-tools";
import { PostgresTeamBalanceRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  players,
  teamBalanceCommandReceipts,
  teamBalanceDraftCandidates,
  teamBalanceDraftParticipants,
  teamBalanceDrafts,
  teamBalanceOutbox,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

class MutableRatingProvider implements TeamBalanceRatingProvider {
  snapshot: TeamBalanceRatingSnapshot = { generation: null, ratings: new Map() };

  async load(): Promise<TeamBalanceRatingSnapshot> {
    return this.snapshot;
  }
}

function commandContext(
  actorSession: TransactionSessionActor,
  authorization: TeamBalanceCommandContext["authorization"],
  key: string,
): TeamBalanceCommandContext {
  return {
    actorSession,
    authorization,
    idempotencyMaterial: new TextEncoder().encode(key),
    requestId: randomUUID(),
  };
}

function serviceError(code: TeamBalanceServiceError["code"]) {
  return (error: unknown) => error instanceof TeamBalanceServiceError && error.code === code;
}

test("S06 draft lifecycle is owner/admin authorized, append-only, transactional, and idempotent", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ratingProvider = new MutableRatingProvider();
  const service = new TeamBalanceService(new PostgresTeamBalanceRepository(database, ratingProvider));
  const ownerId = randomUUID();
  const ownerSessionId = randomUUID();
  const otherOwnerId = randomUUID();
  const otherOwnerSessionId = randomUUID();
  const adminId = randomUUID();
  const adminSessionId = randomUUID();
  const playerIds = Array.from({ length: 10 }, () => randomUUID());
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const ownerActor = { userAccountId: ownerId, sessionId: ownerSessionId, role: "USER", authVersion: 0 } as const;
  const otherOwnerActor = {
    userAccountId: otherOwnerId,
    sessionId: otherOwnerSessionId,
    role: "USER",
    authVersion: 0,
  } as const;
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;
  const createBody = {
    title: "저녁 내전",
    participants: playerIds.map((playerId, index) => ({
      playerId,
      eligiblePositions: [{ position: positions[index % positions.length]!, preference: "MAIN" }],
    })),
  };

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const matchDraftForeignKey = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'competition'
          and t.relname = 'match_series'
          and c.conname = 'match_series_team_balance_draft_id_team_balance_drafts_id_fk'`,
    );
    assert.equal(matchDraftForeignKey.rowCount, 1, "S04 draft UUID seam must become an S06 foreign key");

    await database.insert(userAccounts).values([
      { id: ownerId, loginId: "s06-owner", loginIdNormalized: "s06-owner", status: "APPROVED" },
      { id: otherOwnerId, loginId: "s06-other", loginIdNormalized: "s06-other", status: "APPROVED" },
      { id: adminId, loginId: "s06-admin", loginIdNormalized: "s06-admin", status: "APPROVED", role: "ADMIN" },
    ]);
    await database.insert(authSessions).values([
      {
        id: ownerSessionId,
        tokenHash: randomBytes(32),
        userAccountId: ownerId,
        authVersion: 0,
        role: "USER",
        purpose: "ACCOUNT",
        issuedAt: now,
        expiresAt,
      },
      {
        id: otherOwnerSessionId,
        tokenHash: randomBytes(32),
        userAccountId: otherOwnerId,
        authVersion: 0,
        role: "USER",
        purpose: "ACCOUNT",
        issuedAt: now,
        expiresAt,
      },
      {
        id: adminSessionId,
        tokenHash: randomBytes(32),
        userAccountId: adminId,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: now,
        issuedAt: now,
        expiresAt,
      },
    ]);
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      memberName: `S06 회원 ${index + 1}`,
      memberNameNormalized: `s06 회원 ${index + 1}`,
      nickname: `S06플레이어${index + 1}`,
      nicknameNormalized: `s06플레이어${index + 1}`,
      tagLine: `T${index + 1}`,
      tagLineNormalized: `t${index + 1}`,
    })));

    const createContext = commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "create-1");
    const created = await service.createDraft(createContext, createBody, now);
    assert.equal(created.status, 201);
    assert.equal(created.revision, 0);
    assert.equal(created.replayed, false);
    const draftId = String(created.body.draftId);

    const replayed = await service.createDraft(createContext, createBody, now);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.body.draftId, draftId);
    await assert.rejects(
      service.createDraft(createContext, { ...createBody, title: "다른 요청" }, now),
      serviceError("IDEMPOTENCY_MISMATCH"),
    );

    assert.equal((await database.select().from(teamBalanceDrafts)).length, 1);
    assert.equal((await database.select().from(teamBalanceDraftParticipants)).length, 10);
    assert.equal((await database.select().from(teamBalanceDraftCandidates)).length, 3);
    assert.equal((await database.select().from(teamBalanceCommandReceipts)).length, 1);
    assert.equal((await database.select().from(teamBalanceOutbox)).length, 1);
    assert.equal(
      (await database.select().from(auditEvents).where(eq(auditEvents.targetType, "TEAM_BALANCE_DRAFT"))).length,
      1,
    );
    const ownerDrafts = await service.listDrafts(
      { actorUserAccountId: ownerId, authorization: "OWNER" },
      { page: 1, pageSize: 12 },
    );
    assert.equal(ownerDrafts.totalCount, 1);
    assert.equal(ownerDrafts.items[0]?.id, draftId);
    assert.equal(ownerDrafts.items[0]?.participantCount, 10);
    assert.equal(
      (await service.listDrafts(
        { actorUserAccountId: otherOwnerId, authorization: "OWNER" },
        { page: 1, pageSize: 12 },
      )).totalCount,
      0,
    );
    assert.equal(
      (await service.listDrafts(
        { actorUserAccountId: adminId, authorization: "ADMIN" },
        { page: 1, pageSize: 12 },
      )).totalCount,
      1,
    );
    await assert.rejects(
      database.delete(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)),
    );
    assert.equal(
      (await database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId))).length,
      1,
    );

    await assert.rejects(
      service.selectCandidate(
        commandContext(otherOwnerActor, "APPROVED_ACCOUNT_MUTATION", "cross-owner"),
        draftId,
        0,
        { candidateRank: 1 },
        now,
      ),
      serviceError("NOT_FOUND"),
    );

    const selectContext = commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "select-1");
    const selected = await service.selectCandidate(selectContext, draftId, 0, { candidateRank: 1 }, now);
    assert.equal(selected.revision, 1);
    assert.equal((await service.selectCandidate(selectContext, draftId, 0, { candidateRank: 1 }, now)).replayed, true);
    const saved = await service.saveDraft(
      commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "save-1"),
      draftId,
      1,
      {},
      now,
    );
    assert.equal(saved.revision, 2);

    ratingProvider.snapshot = {
      generation: 7,
      ratings: new Map(playerIds.map((playerId, index) => [playerId, {
        overall: 40 + index,
        confidence: 0.5,
        sampleSize: 10,
        positions: null,
      }])),
    };
    const reevaluated = await service.reevaluateDraft(
      commandContext(adminActor, "ADMIN_MUTATION", "admin-reevaluate-1"),
      draftId,
      2,
      {},
      now,
    );
    assert.equal(reevaluated.revision, 3);
    assert.equal(reevaluated.body.evaluationRound, 2);

    const draft = await service.getDraft({ actorUserAccountId: adminId, authorization: "ADMIN" }, draftId);
    assert.ok(draft);
    assert.equal(draft.status, "EVALUATED");
    assert.equal(draft.evaluationRound, 2);
    assert.equal(draft.ratingGeneration, 7);
    assert.equal(draft.selectedCandidateSignature, null);
    assert.equal(draft.candidates.length, 3);
    assert.equal((await database.select().from(teamBalanceDraftCandidates)).length, 6);
    assert.equal((await database.select().from(teamBalanceOutbox)).length, 4);
    assert.equal(
      (await database.select().from(auditEvents).where(eq(auditEvents.targetType, "TEAM_BALANCE_DRAFT"))).length,
      4,
    );
    assert.equal((await database.select().from(teamBalanceCommandReceipts)).length, 4);

    await database.update(authSessions).set({ revokedAt: now }).where(
      and(eq(authSessions.id, ownerSessionId), eq(authSessions.userAccountId, ownerId)),
    );
    await assert.rejects(
      service.selectCandidate(
        commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "revoked-owner"),
        draftId,
        3,
        { candidateRank: 1 },
        now,
      ),
      serviceError("SESSION_STALE"),
    );
    assert.equal((await database.select().from(teamBalanceOutbox)).length, 4);
  } finally {
    await pool.end();
  }
});
