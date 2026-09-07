import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { DestructionService, type DestructionCommandContext } from "../../src/modules/competitions/destruction";
import { PostgresDestructionAdapter } from "../../src/modules/competitions/destruction/postgres-destruction-adapter";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  destructionApplicationIndex,
  destructionCommandReceipts,
  destructionCompetitions,
  destructionOutbox,
  mediaGalleries,
  mediaGalleryAssets,
  players,
  privateAssets,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
let commandSequence = 0;

function context(actorSession: TransactionSessionActor, purpose: "ACCOUNT" | "ADMIN", label: string): DestructionCommandContext {
  commandSequence += 1;
  return { actorSession, purpose, requestId: randomUUID(), idempotencyMaterial: new TextEncoder().encode(`${label}:${commandSequence}`) };
}

test("S08 adapter persists recruitment, seeded auction, BO stages, roster history, MVP revote and atomic receipts", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 5 });
  const adapter = new PostgresDestructionAdapter(database);
  const service = new DestructionService(adapter.commandHandler());
  const adminId = randomUUID();
  const adminSessionId = randomUUID();
  const ownerIds = Array.from({ length: 20 }, () => randomUUID());
  const ownerSessionIds = Array.from({ length: 20 }, () => randomUUID());
  const playerIds: string[] = Array.from({ length: 20 }, () => randomUUID());
  const extraPlayerId = randomUUID();
  const tournamentId = randomUUID();
  const galleryId = randomUUID();
  const emptyGalleryId = randomUUID();
  const galleryAssetId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "SUPER_ADMIN", authVersion: 0 } as const;
  const ownerActors = ownerIds.map((userAccountId, index) => ({ userAccountId, sessionId: ownerSessionIds[index]!, role: "USER" as const, authVersion: 0 }));
  let revision = 0;

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const tables = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='competition' and table_name like 'destruction_%'");
    assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)), new Set(["destruction_application_index", "destruction_command_receipts", "destruction_competitions", "destruction_outbox"]));
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='operations' and table_name='site_settings'")).rowCount, 1, "0012 operations survives before 0013");
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='media' and table_name='galleries'")).rowCount, 1, "media snapshot survives");
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='competition' and table_name='event_competitions'")).rowCount, 1, "events snapshot survives");

    await database.insert(userAccounts).values([
      { id: adminId, loginId: "s08-super", loginIdNormalized: "s08-super", role: "SUPER_ADMIN", status: "APPROVED" },
      ...ownerIds.map((id, index) => ({ id, loginId: `s08-owner-${index + 1}`, loginIdNormalized: `s08-owner-${index + 1}`, status: "APPROVED" as const })),
    ]);
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
      ...ownerIds.map((userAccountId, index) => ({ id: ownerSessionIds[index]!, tokenHash: randomBytes(32), userAccountId, authVersion: 0, role: "USER" as const, purpose: "ACCOUNT" as const, issuedAt: now, expiresAt })),
    ]);
    await database.insert(players).values([
      ...playerIds.map((id, index) => ({ id, userAccountId: ownerIds[index]!, memberName: `S08 회원 ${index + 1}`, memberNameNormalized: `s08 회원 ${index + 1}`, nickname: `S08선수${index + 1}`, nicknameNormalized: `s08선수${index + 1}`, tagLine: `D${index + 1}`, tagLineNormalized: `d${index + 1}` })),
      { id: extraPlayerId, memberName: "S08 교체", memberNameNormalized: "s08 교체", nickname: "S08교체", nicknameNormalized: "s08교체", tagLine: "DX", tagLineNormalized: "dx" },
    ]);
    await database.insert(privateAssets).values({ id: galleryAssetId, createdByUserAccountId: adminId, ingestSource: "ADMIN", storageProvider: "TEST", storageKey: `s08/${galleryAssetId}`, originalFileName: "result.webp", contentType: "image/webp", byteSize: 1024, width: 640, height: 360, sha256: randomBytes(32), purpose: "GALLERY", status: "READY", readyAt: now });
    await database.insert(mediaGalleries).values([
      { id: galleryId, revision: 0, title: "S08 결과 갤러리", description: "게시 완료된 전용 결과 이미지", status: "DRAFT", createdByUserAccountId: adminId, updatedByUserAccountId: adminId },
      { id: emptyGalleryId, revision: 0, title: "비어 있는 갤러리", description: "READY 이미지가 없어 연결할 수 없음", status: "DRAFT", createdByUserAccountId: adminId, updatedByUserAccountId: adminId },
    ]);
    await database.insert(mediaGalleryAssets).values({ galleryId, privateAssetId: galleryAssetId, ordinal: 0 });
    await database.update(mediaGalleries).set({ revision: 1, status: "PUBLISHED", publishedAt: now }).where(eq(mediaGalleries.id, galleryId));

    const settings = { title: "S08 하늘빛 멸망전", configuration: { preliminaryFormat: "FULL_ROUND_ROBIN_BO1", preliminaryRoundCount: 1, teamCount: 4, laneLimits: { TOP: 4, JGL: 4, MID: 4, ADC: 4, SUP: 4 } } };
    const createContext = context(adminActor, "ADMIN", "create");
    let result = await service.create(createContext, { tournamentId, ...settings });
    revision = result.revision;
    assert.equal((await service.create(createContext, { tournamentId, ...settings })).replayed, true);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "start"), tournamentId, revision, { type: "START_RECRUITMENT", payload: {} });
    revision = result.revision;

    const applicationIds: string[] = [];
    for (let index = 0; index < playerIds.length; index += 1) {
      const applicationId = randomUUID(); applicationIds.push(applicationId);
      result = await service.upsertOwnApplication(context(ownerActors[index]!, "ACCOUNT", `apply-${index}`), tournamentId, playerIds[index]!, revision, { applicationId, position: positions[index % 5] });
      revision = result.revision;
    }
    for (let index = 0; index < applicationIds.length; index += 1) {
      result = await service.executeAdmin(context(adminActor, "ADMIN", `confirm-${index}`), tournamentId, revision, { type: "SET_APPLICATION_STATUS", payload: { applicationId: applicationIds[index], status: "CONFIRMED" } });
      revision = result.revision;
    }
    result = await service.executeAdmin(context(adminActor, "ADMIN", "close"), tournamentId, revision, { type: "CLOSE_RECRUITMENT", payload: {} }); revision = result.revision;

    const captainIndexes = [0, 6, 12, 18];
    const teamIds = Array.from({ length: 4 }, () => randomUUID());
    result = await service.executeAdmin(context(adminActor, "ADMIN", "captains"), tournamentId, revision, { type: "CONFIRM_TEAMS", payload: { seed: "s08-stable-auction-seed", captains: captainIndexes.map((index, teamIndex) => ({ teamId: teamIds[teamIndex], name: `S08 팀 ${teamIndex + 1}`, participantId: applicationIds[index], baselineValue: 0 })) } }); revision = result.revision;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "auction-start"), tournamentId, revision, { type: "START_AUCTION", payload: {} }); revision = result.revision;

    for (let draw = 0; draw < 16; draw += 1) {
      result = await service.executeAdmin(context(adminActor, "ADMIN", `draw-${draw}`), tournamentId, revision, { type: "DRAW_AUCTION", payload: {} }); revision = result.revision;
      const aggregate = (await adapter.getAdmin(tournamentId))!;
      const participant = aggregate.participants.find((entry) => entry.auctionStatus === "DRAWN")!;
      const compatible = aggregate.teams.find((team) => {
        const roster = aggregate.participants.filter((entry) => entry.teamId === team.id);
        return roster.length < 5 && !roster.some((entry) => entry.position === participant.position);
      });
      assert.ok(compatible);
      result = await service.executeAdmin(context(adminActor, "ADMIN", `sell-${draw}`), tournamentId, revision, { type: "SELL_AUCTION", payload: { participantId: participant.id, teamId: compatible.id, purchasePoints: 1 } }); revision = result.revision;
    }
    result = await service.executeAdmin(context(adminActor, "ADMIN", "preliminary"), tournamentId, revision, { type: "PUBLISH_PRELIMINARY", payload: {} }); revision = result.revision;
    let aggregate = (await adapter.getAdmin(tournamentId))!;
    assert.equal(aggregate.preliminaryFixtures.length, 6);

    for (const fixture of aggregate.preliminaryFixtures) {
      result = await service.executeAdmin(context(adminActor, "ADMIN", `prelim-${fixture.id}`), tournamentId, revision, { type: "RECORD_PRELIMINARY_RESULT", payload: { fixtureId: fixture.id, teamAScore: 1, teamBScore: 0, winnerTeamId: fixture.teamAId } }); revision = result.revision;
      aggregate = (await adapter.getAdmin(tournamentId))!;
      const ballot = aggregate.mvpBallots.find((entry) => entry.fixtureId === fixture.id)!;
      result = await service.executeAdmin(context(adminActor, "ADMIN", `prelim-mvp-${fixture.id}`), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: fixture.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    }

    aggregate = (await adapter.getAdmin(tournamentId))!;
    const revoteFixture = aggregate.preliminaryFixtures[0]!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "reset-mvp"), tournamentId, revision, { type: "RESET_MVP", payload: { fixtureId: revoteFixture.id } }); revision = result.revision;
    const revoteBallot = (await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === revoteFixture.id)!;
    const candidate = revoteBallot.participantPlayerIds[0]!;
    const alternate = revoteBallot.participantPlayerIds[1]!;
    for (const voterPlayerId of revoteBallot.participantPlayerIds) {
      const ownerIndex = playerIds.indexOf(voterPlayerId);
      assert.ok(ownerIndex >= 0);
      result = await service.castOwnMvpVote(context(ownerActors[ownerIndex]!, "ACCOUNT", `vote-${voterPlayerId}`), tournamentId, voterPlayerId, revision, { fixtureId: revoteFixture.id, candidatePlayerId: voterPlayerId === candidate ? alternate : candidate }); revision = result.revision;
    }
    assert.equal((await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === revoteFixture.id)?.finalizedPlayerId, candidate);

    result = await service.executeAdmin(context(adminActor, "ADMIN", "tournament"), tournamentId, revision, { type: "PUBLISH_TOURNAMENT", payload: {} }); revision = result.revision;
    aggregate = (await adapter.getAdmin(tournamentId))!;
    const outgoing = aggregate.participants.find((entry) => !entry.isCaptain)!;
    const historical = aggregate.rosterSnapshots.find((snapshot) => [...snapshot.teamA, ...snapshot.teamB].some((entry) => entry.playerId === outgoing.playerId));
    assert.ok(historical);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "replacement"), tournamentId, revision, { type: "REPLACE_PARTICIPANT", payload: { replacementId: randomUUID(), participantId: outgoing.id, incomingPlayerId: extraPlayerId, incomingPosition: outgoing.position, reason: "격리 계약 교체" } }); revision = result.revision;
    assert.ok(historical.teamA.concat(historical.teamB).some((entry) => entry.playerId === outgoing.playerId), "past roster snapshot is immutable");

    aggregate = (await adapter.getAdmin(tournamentId))!;
    for (const fixture of aggregate.tournamentBracket!.fixtures.filter((entry) => entry.stage === "SEMI_FINAL")) {
      result = await service.executeAdmin(context(adminActor, "ADMIN", `semi-${fixture.id}`), tournamentId, revision, { type: "RECORD_TOURNAMENT_RESULT", payload: { fixtureId: fixture.id, teamAScore: 2, teamBScore: 0, winnerTeamId: fixture.teamAId } }); revision = result.revision;
      const ballot = (await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === fixture.id)!;
      result = await service.executeAdmin(context(adminActor, "ADMIN", `semi-mvp-${fixture.id}`), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: fixture.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    }
    aggregate = (await adapter.getAdmin(tournamentId))!;
    let final = aggregate.tournamentBracket!.fixtures.find((entry) => entry.stage === "FINAL")!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final"), tournamentId, revision, { type: "RECORD_TOURNAMENT_RESULT", payload: { fixtureId: final.id, teamAScore: 2, teamBScore: 1, winnerTeamId: final.teamAId } }); revision = result.revision;
    let ballot = (await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === final.id)!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final-mvp"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: final.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;

    aggregate = (await adapter.getAdmin(tournamentId))!;
    const firstSemi = aggregate.tournamentBracket!.fixtures.find((entry) => entry.stage === "SEMI_FINAL")!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "correct-semi"), tournamentId, revision, { type: "CORRECT_TOURNAMENT_RESULT", payload: { fixtureId: firstSemi.id, teamAScore: 0, teamBScore: 2, winnerTeamId: firstSemi.teamBId } }); revision = result.revision;
    aggregate = (await adapter.getAdmin(tournamentId))!;
    assert.equal(aggregate.tournamentBracket!.fixtures.find((entry) => entry.stage === "FINAL")!.result, null);
    assert.equal(aggregate.mvpBallots.some((entry) => entry.fixtureId === final.id), false, "downstream MVP is invalidated with its result");
    ballot = aggregate.mvpBallots.find((entry) => entry.fixtureId === firstSemi.id)!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "corrected-semi-mvp"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: firstSemi.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    final = (await adapter.getAdmin(tournamentId))!.tournamentBracket!.fixtures.find((entry) => entry.stage === "FINAL")!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final-again"), tournamentId, revision, { type: "RECORD_TOURNAMENT_RESULT", payload: { fixtureId: final.id, teamAScore: 2, teamBScore: 0, winnerTeamId: final.teamAId } }); revision = result.revision;
    ballot = (await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === final.id)!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final-mvp-again"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: final.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "complete-invalid-gallery"), tournamentId, revision, { type: "COMPLETE_DESTRUCTION", payload: { galleryId: emptyGalleryId } }), /INVALID_GALLERY/);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "complete"), tournamentId, revision, { type: "COMPLETE_DESTRUCTION", payload: { galleryId } }); revision = result.revision;
    assert.equal(result.body.status, "COMPLETED");

    let publicDto = await adapter.getPublic(tournamentId);
    assert.equal(JSON.stringify(publicDto).includes("userAccountId"), false);
    assert.equal(JSON.stringify(publicDto).includes("auctionSeed"), false);
    assert.equal(publicDto?.gallery?.id, galleryId);
    assert.equal(publicDto?.gallery?.images[0]?.url, `/api/media/assets/${galleryAssetId}`);
    assert.equal(JSON.stringify(publicDto).includes("storageKey"), false);
    assert.equal(JSON.stringify(publicDto).includes("sha256"), false);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "gallery-clear"), tournamentId, revision, { type: "SET_MEDIA_GALLERY", payload: { galleryId: null } }); revision = result.revision;
    assert.equal((await adapter.getPublic(tournamentId))?.gallery, null);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "gallery-restore"), tournamentId, revision, { type: "SET_MEDIA_GALLERY", payload: { galleryId } }); revision = result.revision;
    publicDto = await adapter.getPublic(tournamentId);
    assert.equal(publicDto?.gallery?.id, galleryId);
    assert.equal((await adapter.getOwnApplication(tournamentId, ownerIds[0]!))?.playerId, playerIds[0]);
    assert.equal((await database.select().from(destructionApplicationIndex)).length, 20);
    const receipts = await database.select().from(destructionCommandReceipts);
    assert.equal((await database.select().from(destructionOutbox)).length, receipts.length);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "DESTRUCTION"))).length, receipts.length);
    await assert.rejects(database.delete(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)));
  } finally { await pool.end(); }
});
