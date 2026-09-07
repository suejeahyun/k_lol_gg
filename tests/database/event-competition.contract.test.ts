import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { buildSingleEliminationBracket } from "../../src/modules/competitions/core";
import { EventService, type EventCommandContext, type EventAggregate, EventDomainError } from "../../src/modules/competitions/events";
import { PostgresEventAdapter } from "../../src/modules/competitions/events/infrastructure/postgres-event-adapters";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import {
  auditEvents,
  authSessions,
  eventCommandReceipts,
  eventCompetitions,
  eventOutbox,
  eventParticipantIndex,
  players,
  userAccounts,
} from "../../src/platform/db/schema";

function context(actorSession: TransactionSessionActor, purpose: "ACCOUNT" | "ADMIN", key: string): EventCommandContext {
  return { actorSession, purpose, requestId: randomUUID(), idempotencyMaterial: new TextEncoder().encode(key) };
}

function eventError(code: EventDomainError["code"]) {
  return (error: unknown) => error instanceof EventDomainError && error.code === code;
}

test("S07 event adapter persists exact-ten lifecycle, S06 teams, correction invalidation and owner-safe reads", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adapter = new PostgresEventAdapter(database);
  const service = new EventService(adapter.commandHandler());
  const adminId = randomUUID();
  const adminSessionId = randomUUID();
  const ownerId = randomUUID();
  const ownerSessionId = randomUUID();
  const otherId = randomUUID();
  const otherSessionId = randomUUID();
  const playerIds = Array.from({ length: 10 }, () => randomUUID());
  const eventId = randomUUID();
  const ownerEventId = randomUUID();
  const now = new Date();
  const opensAt = new Date(now.getTime() - 60_000).toISOString();
  const closesAt = new Date(now.getTime() + 3_600_000).toISOString();
  const expiresAt = new Date(now.getTime() + 3_600_000);
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;
  const ownerActor = { userAccountId: ownerId, sessionId: ownerSessionId, role: "USER", authVersion: 0 } as const;
  const otherActor = { userAccountId: otherId, sessionId: otherSessionId, role: "USER", authVersion: 0 } as const;
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  const settings = { title: "S07 하늘빛 이벤트전", description: "격리 DB 계약", format: "POSITION", recruitmentOpensAt: opensAt, recruitmentClosesAt: closesAt, bracketBestOf: 9 } as const;
  const participants = playerIds.map((playerId, index) => ({
    participantId: randomUUID(),
    playerId,
    mainPosition: positions[index % 5]!,
    subPositions: [],
  }));

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const tables = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='competition' and table_name like 'event_%'");
    assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)), new Set(["event_command_receipts", "event_competitions", "event_outbox", "event_participant_index"]));

    await database.insert(userAccounts).values([
      { id: adminId, loginId: "s07-admin", loginIdNormalized: "s07-admin", role: "ADMIN", status: "APPROVED" },
      { id: ownerId, loginId: "s07-owner", loginIdNormalized: "s07-owner", status: "APPROVED" },
      { id: otherId, loginId: "s07-other", loginIdNormalized: "s07-other", status: "APPROVED" },
    ]);
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
      { id: ownerSessionId, tokenHash: randomBytes(32), userAccountId: ownerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt },
      { id: otherSessionId, tokenHash: randomBytes(32), userAccountId: otherId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt },
    ]);
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      userAccountId: index === 0 ? ownerId : index === 1 ? otherId : null,
      memberName: `S07 회원 ${index + 1}`,
      memberNameNormalized: `s07 회원 ${index + 1}`,
      nickname: `S07플레이어${index + 1}`,
      nicknameNormalized: `s07플레이어${index + 1}`,
      tagLine: `E${index + 1}`,
      tagLineNormalized: `e${index + 1}`,
    })));

    const createContext = context(adminActor, "ADMIN", "create-main");
    const created = await service.create(createContext, { eventId, settings });
    assert.equal(created.revision, 1);
    assert.equal((await service.create(createContext, { eventId, settings })).replayed, true);
    await service.executeAdmin(context(adminActor, "ADMIN", "start-main"), eventId, 1, { type: "START_RECRUITMENT", payload: {} });
    await service.executeAdmin(context(adminActor, "ADMIN", "import-nine"), eventId, 2, { type: "IMPORT_PARTICIPANTS", payload: { participants: participants.slice(0, 9) } });
    await assert.rejects(
      service.executeAdmin(context(adminActor, "ADMIN", "close-nine"), eventId, 3, { type: "CLOSE_RECRUITMENT", payload: {} }),
      eventError("PRECONDITION_FAILED"),
    );
    await service.executeAdmin(context(adminActor, "ADMIN", "add-tenth"), eventId, 3, { type: "ADD_PARTICIPANT", payload: { participant: participants[9] } });
    await service.executeAdmin(context(adminActor, "ADMIN", "close-ten"), eventId, 4, { type: "CLOSE_RECRUITMENT", payload: {} });
    const balanced = await service.executeAdmin(context(adminActor, "ADMIN", "balance"), eventId, 5, { type: "BUILD_TEAMS", payload: {} });
    assert.equal(balanced.body.status, "TEAM_BUILDING");
    const bracketed = await service.executeAdmin(context(adminActor, "ADMIN", "bracket"), eventId, 6, { type: "GENERATE_BRACKET", payload: {} });
    assert.equal(bracketed.body.status, "IN_PROGRESS");

    const publicEvent = await adapter.getPublic(eventId, now);
    assert.equal(publicEvent?.participantCount, 10);
    assert.equal(publicEvent?.teams.length, 2);
    assert.equal(JSON.stringify(publicEvent).includes("ownerUserAccountId"), false);
    assert.equal((await adapter.getAdmin(eventId))?.settings.bracketBestOf, 9, "BO1~9 odd upper bound is persisted");
    await assert.rejects(database.delete(eventCompetitions).where(eq(eventCompetitions.id, eventId)));

    const current = (await adapter.getAdmin(eventId))!;
    const fourTeams = [1, 2, 3, 4].map((seed) => ({ id: `${eventId}:TEAM:${seed}`, name: `T${seed}`, seed, balanceScore: 500 - seed, members: [] }));
    const synthetic: EventAggregate = {
      ...current,
      teams: fourTeams,
      bracket: buildSingleEliminationBracket({ competitionId: eventId, teams: fourTeams.map((team) => ({ id: team.id, seed: team.seed })), bestOf: 9 }),
      lifecycle: { status: "IN_PROGRESS", cancelledFrom: null, cancellationReason: null },
    };
    await database.update(eventCompetitions).set({ aggregateJson: JSON.parse(JSON.stringify(synthetic)), status: "IN_PROGRESS" }).where(eq(eventCompetitions.id, eventId));
    const [semiOne, semiTwo, final] = synthetic.bracket!.fixtures;
    await service.executeAdmin(context(adminActor, "ADMIN", "semi-one"), eventId, 7, { type: "RECORD_RESULT", payload: { fixtureId: semiOne!.id, teamAScore: 5, teamBScore: 0, winnerTeamId: semiOne!.teamAId } });
    await service.executeAdmin(context(adminActor, "ADMIN", "semi-two"), eventId, 8, { type: "RECORD_RESULT", payload: { fixtureId: semiTwo!.id, teamAScore: 5, teamBScore: 2, winnerTeamId: semiTwo!.teamAId } });
    await service.executeAdmin(context(adminActor, "ADMIN", "final"), eventId, 9, { type: "RECORD_RESULT", payload: { fixtureId: final!.id, teamAScore: 5, teamBScore: 1, winnerTeamId: semiOne!.teamAId } });
    const corrected = await service.executeAdmin(context(adminActor, "ADMIN", "correct-semi"), eventId, 10, { type: "CORRECT_RESULT", payload: { fixtureId: semiOne!.id, teamAScore: 0, teamBScore: 5, winnerTeamId: semiOne!.teamBId } });
    assert.deepEqual(corrected.body.correctionPlan, {
      correctedFixtureId: semiOne!.id,
      downstreamFixtureIds: [final!.id],
      invalidatedResultFixtureIds: [final!.id],
      previousWinnerTeamId: semiOne!.teamAId,
      nextWinnerTeamId: semiOne!.teamBId,
    });
    assert.equal((await adapter.getAdmin(eventId))?.bracket?.fixtures.find((fixture) => fixture.id === final!.id)?.result, null);

    await service.create(context(adminActor, "ADMIN", "create-owner"), { eventId: ownerEventId, settings: { ...settings, title: "신청 소유권 계약", bracketBestOf: 1 } });
    await service.executeAdmin(context(adminActor, "ADMIN", "start-owner"), ownerEventId, 1, { type: "START_RECRUITMENT", payload: {} });
    const participantId = randomUUID();
    const applyContext = context(ownerActor, "ACCOUNT", "owner-apply");
    const applied = await service.upsertOwnApplication(applyContext, ownerEventId, playerIds[0]!, 2, { participantId, mainPosition: "TOP", subPositions: ["MID"] });
    assert.equal((await service.upsertOwnApplication(applyContext, ownerEventId, playerIds[0]!, 2, { participantId, mainPosition: "TOP", subPositions: ["MID"] })).replayed, true);
    assert.equal((await adapter.getOwnApplication(ownerEventId, ownerId))?.playerId, playerIds[0]);
    await assert.rejects(
      service.upsertOwnApplication(context(otherActor, "ACCOUNT", "forged-owner"), ownerEventId, playerIds[0]!, applied.revision, { participantId: randomUUID(), mainPosition: "TOP", subPositions: [] }),
      eventError("INVALID_AUTHORIZATION_INTENT"),
    );

    assert.equal((await database.select().from(eventParticipantIndex).where(eq(eventParticipantIndex.eventId, eventId))).length, 10);
    assert.ok((await database.select().from(eventCommandReceipts)).length >= 14);
    assert.equal((await database.select().from(eventOutbox)).length, (await database.select().from(eventCommandReceipts)).length);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "EVENT"))).length, (await database.select().from(eventCommandReceipts)).length);
  } finally {
    await pool.end();
  }
});
