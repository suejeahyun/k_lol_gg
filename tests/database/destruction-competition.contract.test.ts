import { DestructionCommandHandler } from "../../src/modules/competitions/destruction/destruction-command-handler";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { DestructionService, type DestructionCommandContext } from "../../src/modules/competitions/destruction";
import { PostgresDestructionAdapter } from "../../src/modules/competitions/destruction/postgres-destruction-adapter";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { deriveLegacyCompetitionUuid } from "../../src/platform/legacy-identifiers";
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
  const extraOwnerId = randomUUID();
  const tournamentId = deriveLegacyCompetitionUuid("competition.destruction_competitions", 801)!;
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
      { id: extraOwnerId, loginId: "s08-replacement", loginIdNormalized: "s08-replacement", status: "APPROVED" },
      ...ownerIds.map((id, index) => ({ id, loginId: `s08-owner-${index + 1}`, loginIdNormalized: `s08-owner-${index + 1}`, status: "APPROVED" as const })),
    ]);
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
      ...ownerIds.map((userAccountId, index) => ({ id: ownerSessionIds[index]!, tokenHash: randomBytes(32), userAccountId, authVersion: 0, role: "USER" as const, purpose: "ACCOUNT" as const, issuedAt: now, expiresAt })),
    ]);
    await database.insert(players).values([
      ...playerIds.map((id, index) => ({ id, userAccountId: ownerIds[index]!, memberName: `S08 회원 ${index + 1}`, memberNameNormalized: `s08 회원 ${index + 1}`, nickname: `S08선수${index + 1}`, nicknameNormalized: `s08선수${index + 1}`, tagLine: `D${index + 1}`, tagLineNormalized: `d${index + 1}` })),
      { id: extraPlayerId, userAccountId: extraOwnerId, memberName: "S08 교체", memberNameNormalized: "s08 교체", nickname: "S08교체", nicknameNormalized: "s08교체", tagLine: "DX", tagLineNormalized: "dx" },
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
    assert.equal(await adapter.resolveLegacyId(801), null);
    let result = await service.create(createContext, { tournamentId, ...settings });
    revision = result.revision;
    assert.equal(await adapter.resolveLegacyId(801), tournamentId);
    assert.equal((await service.create(createContext, { tournamentId, ...settings })).replayed, true);
    const schedule = { recruitmentEndsAt: "2026-10-01T01:00:00.000Z", auctionStartsAt: "2026-10-01T02:00:00.000Z", preliminaryStartsAt: "2026-10-02T01:00:00.000Z", tournamentStartsAt: null };
    result = await service.executeAdmin(context(adminActor, "ADMIN", "schedule"), tournamentId, revision, { type: "SET_SCHEDULE", payload: schedule }); revision = result.revision;
    assert.deepEqual((await adapter.getPublic(tournamentId))?.schedule, schedule);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "start"), tournamentId, revision, { type: "START_RECRUITMENT", payload: {} });
    revision = result.revision;

    await assert.rejects(service.upsertOwnApplication(context(ownerActors[0]!, "ACCOUNT", "rift-needs-position"), tournamentId, playerIds[0]!, revision, { applicationId: randomUUID(), position: null }), /포지션이 필요/);
    const applicationIds: string[] = [];
    for (let index = 0; index < playerIds.length; index += 1) {
      const applicationId = randomUUID(); applicationIds.push(applicationId);
      result = await service.upsertOwnApplication(context(ownerActors[index]!, "ACCOUNT", `apply-${index}`), tournamentId, playerIds[index]!, revision, { applicationId, position: positions[index % 5] });
      revision = result.revision;
    }
    await assert.rejects(service.upsertOwnApplication(context(ownerActors[0]!, "ACCOUNT", "full-lane"), tournamentId, playerIds[0]!, revision, { applicationId: applicationIds[0], position: "JGL" }), /모집 정원/);
    result = await service.cancelOwnApplication(context(ownerActors[0]!, "ACCOUNT", "withdraw"), tournamentId, playerIds[0]!, revision); revision = result.revision;
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "review-withdrawn"), tournamentId, revision, { type: "SET_APPLICATION_STATUS", payload: { applicationId: applicationIds[0], status: "CONFIRMED" } }), /취소된 신청/);
    result = await service.upsertOwnApplication(context(ownerActors[0]!, "ACCOUNT", "reapply"), tournamentId, playerIds[0]!, revision, { applicationId: applicationIds[0], position: "TOP" }); revision = result.revision;
    for (let index = 0; index < applicationIds.length; index += 1) {
      result = await service.executeAdmin(context(adminActor, "ADMIN", `confirm-${index}`), tournamentId, revision, { type: "SET_APPLICATION_STATUS", payload: { applicationId: applicationIds[index], status: "CONFIRMED" } });
      revision = result.revision;
    }
    await assert.rejects(service.upsertOwnApplication(context(ownerActors[0]!, "ACCOUNT", "confirmed-owner-edit"), tournamentId, playerIds[0]!, revision, { applicationId: applicationIds[0], position: "MID" }), /참가가 확정/);
    await assert.rejects(service.upsertOwnApplication(context(ownerActors[1]!, "ACCOUNT", "other-owner"), tournamentId, playerIds[0]!, revision, { applicationId: applicationIds[0], position: "TOP" }), /FORBIDDEN/);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "close"), tournamentId, revision, { type: "CLOSE_RECRUITMENT", payload: {} }); revision = result.revision;

    // A second isolated tournament exercises mode-specific valuations against real transactions.
    const aramId = randomUUID();
    async function recruitPositionless(id: string, gameMode: "ARAM" | "ARAM_MAYHEM") {
      let rev = (await service.create(context(adminActor, "ADMIN", "positionless-create"), { tournamentId: id, title: gameMode + " DB QA", configuration: { gameMode, teamCount: 4, recruitmentLimit: 20, preliminaryFormat: "FULL_ROUND_ROBIN_BO1" } })).revision;
      rev = (await service.executeAdmin(context(adminActor, "ADMIN", "positionless-start"), id, rev, { type: "START_RECRUITMENT", payload: {} })).revision;
      for (let i = 0; i < playerIds.length; i++) {
        rev = (await service.upsertOwnApplication(context(ownerActors[i]!, "ACCOUNT", "no-position"), id, playerIds[i]!, rev, { applicationId: applicationIds[i], ...(i % 2 ? { position: null } : {}) })).revision;
      }
      assert.equal((await adapter.getPublic(id))!.recruitment.length, 1);
      assert.equal((await adapter.getPublic(id))!.recruitment[0]!.applied, 20);
      assert.equal((await pool.query("select count(*)::int as n from competition.destruction_application_index where tournament_id=$1 and position is null", [id])).rows[0].n, 20);
      for (const applicationId of applicationIds) rev = (await service.executeAdmin(context(adminActor, "ADMIN", "no-position-confirm"), id, rev, { type: "SET_APPLICATION_STATUS", payload: { applicationId, status: "CONFIRMED" } })).revision;
      rev = (await service.executeAdmin(context(adminActor, "ADMIN", "no-position-close"), id, rev, { type: "CLOSE_RECRUITMENT", payload: {} })).revision;
      assert.ok((await adapter.getAdmin(id))!.participants.every((p) => p.position === null));
      return rev;
    }
    let aramRevision = await recruitPositionless(aramId, "ARAM");
    const aramCaptains = [0, 6, 12, 18].map((index, i) => ({ teamId: randomUUID(), name: `칼바람 ${i + 1}팀`, participantId: applicationIds[index], baselineValue: 199 }));
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "aram-no-records"), aramId, aramRevision, { type: "CONFIRM_TEAMS", payload: { seed: "aram-qa-seed", captains: aramCaptains } }), /전적과 임시 등급/);
    let fetched = 0;
    const aramService = new DestructionService(new DestructionCommandHandler({ ...adapter.dependencies, aramRecords: { next: async (_tx, _aggregate, _id, at) => {
      fetched += 1;
      return { collection: { linkId: "test-link", linkRevision: 1, matchIds: [], processed: 100, wins: 55, losses: 45, excluded: 0, startedAt: at }, record: { mode: "ARAM", source: "RIOT", wins: 55, losses: 45, fetchedAt: at, evidence: "injected gateway contract" } };
    } } }));
    for (const participantId of applicationIds) {
      const request = context(adminActor, "ADMIN", "aram-sync");
      const expected = aramRevision;
      const action = { type: "SYNC_ARAM_RECORD", payload: { participantId } };
      aramRevision = (await aramService.executeAdmin(request, aramId, expected, action)).revision;
      assert.equal((await aramService.executeAdmin(request, aramId, expected, action)).replayed, true);
    }
    assert.equal(fetched, 20, "a replay never repeats upstream collection");
    aramRevision = (await aramService.executeAdmin(context(adminActor, "ADMIN", "aram-captains"), aramId, aramRevision, { type: "CONFIRM_TEAMS", payload: { seed: "aram-qa-seed", captains: aramCaptains } })).revision;
    assert.ok((await adapter.getAdmin(aramId))!.teams.every((t) => t.initialAuctionPoints === 1750), "server ignores client baseline and uses each captain's own record");
    await assert.rejects(aramService.executeAdmin(context(adminActor, "ADMIN", "aram-frozen"), aramId, aramRevision, { type: "RESET_ARAM_RECORD", payload: { participantId: applicationIds[0] } }), /주장 확정/);
    aramRevision = (await aramService.executeAdmin(context(adminActor, "ADMIN", "aram-start"), aramId, aramRevision, { type: "START_AUCTION", payload: {} })).revision;
    aramRevision = (await aramService.executeAdmin(context(adminActor, "ADMIN", "aram-draw"), aramId, aramRevision, { type: "DRAW_AUCTION", payload: {} })).revision;
    const aramState = (await adapter.getAdmin(aramId))!;
    const aramDrawn = aramState.participants.find((p) => p.auctionStatus === "DRAWN")!;
    const aramTeam = aramState.teams.find((t) => aramState.participants.filter((p) => p.teamId === t.id).length < 5)!;
    await assert.rejects(aramService.executeAdmin(context(adminActor, "ADMIN", "aram-cheap"), aramId, aramRevision, { type: "SELL_AUCTION", payload: { participantId: aramDrawn.id, teamId: aramTeam.id, purchasePoints: 249 } }));
    aramRevision = (await aramService.executeAdmin(context(adminActor, "ADMIN", "aram-sale"), aramId, aramRevision, { type: "SELL_AUCTION", payload: { participantId: aramDrawn.id, teamId: aramTeam.id, purchasePoints: 250 } })).revision;
    assert.equal((await adapter.getAdmin(aramId))!.teams.find((t) => t.id === aramTeam.id)!.remainingAuctionPoints, 1500);
    assert.equal((await adapter.getPublic(aramId))!.auctionRatings.length, 20);
    assert.equal(JSON.stringify(await adapter.getPublic(aramId)).includes("test-link"), false);

    const mayhemId = randomUUID();
    let mayhemRevision = await recruitPositionless(mayhemId, "ARAM_MAYHEM");
    const verified = { participantId: applicationIds[0], mode: "ARAM_MAYHEM", wins: 55, losses: 45, evidence: "합성 전적 화면 최근 100판 · 2026-09-25 운영 확인" };
    assert.throws(() => service.executeAdmin(context(ownerActors[0]!, "ACCOUNT", "user-verification"), mayhemId, mayhemRevision, { type: "VERIFY_ARAM_RECORD", payload: verified }), /FORBIDDEN/);
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "wrong-mode"), mayhemId, mayhemRevision, { type: "VERIFY_ARAM_RECORD", payload: { ...verified, mode: "ARAM" } }), /모드가 일치/);
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "mayhem-no-riot"), mayhemId, mayhemRevision, { type: "SYNC_ARAM_RECORD", payload: { participantId: applicationIds[0] } }));
    for (const participantId of applicationIds) {
      const request = context(adminActor, "ADMIN", "verify-mayhem"); const expected = mayhemRevision;
      const action = { type: "VERIFY_ARAM_RECORD", payload: { ...verified, participantId } };
      mayhemRevision = (await service.executeAdmin(request, mayhemId, expected, action)).revision;
      assert.equal((await service.executeAdmin(request, mayhemId, expected, action)).replayed, true);
    }
    const verifiedAudit = (await database.select().from(auditEvents).where(eq(auditEvents.action, "DESTRUCTION_VERIFY_ARAM_RECORD")))[0]!;
    assert.ok(JSON.stringify(verifiedAudit.metadataJson).includes("ADMIN_VERIFIED"));
    assert.ok(JSON.stringify(verifiedAudit.metadataJson).includes(verified.evidence));
    assert.equal(verifiedAudit.actorUserAccountId, adminId);
    assert.equal(JSON.stringify(await adapter.getPublic(mayhemId)).includes(verified.evidence), false);
    mayhemRevision = (await service.executeAdmin(context(adminActor, "ADMIN", "mayhem-reset"), mayhemId, mayhemRevision, { type: "RESET_ARAM_RECORD", payload: { participantId: applicationIds[0] } })).revision;
    assert.equal((await adapter.getAdmin(mayhemId))!.participants.find((p) => p.id === applicationIds[0])!.minimumBid, undefined);
    mayhemRevision = (await service.executeAdmin(context(adminActor, "ADMIN", "mayhem-reverify"), mayhemId, mayhemRevision, { type: "VERIFY_ARAM_RECORD", payload: verified })).revision;
    mayhemRevision = (await service.executeAdmin(context(adminActor, "ADMIN", "mayhem-captains"), mayhemId, mayhemRevision, { type: "CONFIRM_TEAMS", payload: { seed: "mayhem-qa-seed", captains: aramCaptains } })).revision;
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "mayhem-locked"), mayhemId, mayhemRevision, { type: "VERIFY_ARAM_RECORD", payload: verified }), /주장 확정/);
    mayhemRevision = (await service.executeAdmin(context(adminActor, "ADMIN", "mayhem-start"), mayhemId, mayhemRevision, { type: "START_AUCTION", payload: {} })).revision;

    // Exercise both new modes through the common auction, preliminary, BO3 and MVP completion.
    for (const [id, initialRevision] of [[aramId, aramRevision], [mayhemId, mayhemRevision]] as const) {
      let modeRevision = initialRevision;
      const run = async (type: string, payload: Record<string, unknown> = {}) => { modeRevision = (await service.executeAdmin(context(adminActor, "ADMIN", type), id, modeRevision, { type, payload })).revision; };
      for (;;) {
        const state = (await adapter.getAdmin(id))!;
        if (state.participants.every((p) => p.isCaptain || p.auctionStatus === "SOLD")) break;
        await run("DRAW_AUCTION");
        const drawnState = (await adapter.getAdmin(id))!;
        const drawn = drawnState.participants.find((p) => p.auctionStatus === "DRAWN")!;
        const team = drawnState.teams.find((t) => drawnState.participants.filter((p) => p.teamId === t.id).length < 5)!;
        assert.ok(drawn.minimumBid);
        await run("SELL_AUCTION", { participantId: drawn.id, teamId: team.id, purchasePoints: drawn.minimumBid });
      }
      assert.ok((await adapter.getAdmin(id))!.teams.every((t) => t.remainingAuctionPoints === 750));
      await run("PUBLISH_PRELIMINARY");
      for (const f of (await adapter.getAdmin(id))!.preliminaryFixtures) {
        await run("RECORD_PRELIMINARY_RESULT", { fixtureId: f.id, teamAScore: 1, teamBScore: 0, winnerTeamId: f.teamAId });
        const ballot = (await adapter.getAdmin(id))!.mvpBallots.find((b) => b.fixtureId === f.id)!;
        await run("ASSIGN_MVP", { fixtureId: f.id, playerId: ballot.participantPlayerIds[0] });
      }
      assert.ok((await adapter.getAdmin(id))!.rosterSnapshots.every((snapshot) => [...snapshot.teamA, ...snapshot.teamB].every((p) => p.position === null)));
      await run("PUBLISH_TOURNAMENT");
      for (;;) {
        const state = (await adapter.getAdmin(id))!;
        const f = state.tournamentBracket!.fixtures.find((f) => f.teamAId && f.teamBId && !f.result);
        if (!f) break;
        assert.equal(f.bestOf, 3);
        await run("RECORD_TOURNAMENT_RESULT", { fixtureId: f.id, teamAScore: 2, teamBScore: 1, winnerTeamId: f.teamAId });
        const ballot = (await adapter.getAdmin(id))!.mvpBallots.find((b) => b.fixtureId === f.id)!;
        await run("ASSIGN_MVP", { fixtureId: f.id, playerId: ballot.participantPlayerIds[0] });
      }
      await run("COMPLETE_DESTRUCTION");
      const published = (await adapter.getPublic(id))!;
      assert.equal(published.status, "COMPLETED"); assert.ok(published.championTeamId);
      assert.equal(published.auctionRatings.length, 20);
      assert.ok(published.auctionRatings.every((r) => r.source === (id === aramId ? "RIOT" : "ADMIN_VERIFIED")));
    }

    const captainIndexes = [0, 6, 12, 18];
    const teamIds = Array.from({ length: 4 }, () => randomUUID());
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "insufficient-captain-budget"), tournamentId, revision, { type: "CONFIRM_TEAMS", payload: { seed: "s08-stable-auction-seed", captains: captainIndexes.map((index, teamIndex) => ({ teamId: teamIds[teamIndex], name: `S08 팀 ${teamIndex + 1}`, participantId: applicationIds[index], baselineValue: 200 })) } }), /최소 4P/);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "captains"), tournamentId, revision, { type: "CONFIRM_TEAMS", payload: { seed: "s08-stable-auction-seed", captains: captainIndexes.map((index, teamIndex) => ({ teamId: teamIds[teamIndex], name: `S08 팀 ${teamIndex + 1}`, participantId: applicationIds[index], baselineValue: 0 })) } }); revision = result.revision;
    const startContext = context(adminActor, "ADMIN", "auction-start");
    const startResults = await Promise.all([0, 1].map(() => service.executeAdmin(startContext, tournamentId, revision, { type: "START_AUCTION", payload: {} })));
    assert.equal(startResults.filter((entry) => entry.replayed).length, 1, "simultaneous identical requests produce one receipt and one replay");
    revision = startResults[0]!.revision;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "pause"), tournamentId, revision, { type: "PAUSE_AUCTION", payload: {} }); revision = result.revision;
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "draw-while-paused"), tournamentId, revision, { type: "DRAW_AUCTION", payload: {} }), /경매를 재개/);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "cancel-paused"), tournamentId, revision, { type: "CANCEL_DESTRUCTION", payload: { reason: "격리 복구 검증" } }); revision = result.revision;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "restore-paused"), tournamentId, revision, { type: "RESTORE_DESTRUCTION", payload: {} }); revision = result.revision;
    assert.equal((await adapter.getAdmin(tournamentId))?.auctionPaused, true);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "resume"), tournamentId, revision, { type: "RESUME_AUCTION", payload: {} }); revision = result.revision;

    for (let draw = 0; draw < 16; draw += 1) {
      if (draw === 0) {
        const simultaneous = await Promise.allSettled([0, 1].map((index) => service.executeAdmin(context(adminActor, "ADMIN", `draw-concurrent-${index}`), tournamentId, revision, { type: "DRAW_AUCTION", payload: {} })));
        assert.equal(simultaneous.filter((entry) => entry.status === "fulfilled").length, 1, "different commands at one revision cannot both draw");
        const winner = simultaneous.find((entry) => entry.status === "fulfilled");
        assert.ok(winner?.status === "fulfilled"); revision = winner.value.revision;
      } else {
        result = await service.executeAdmin(context(adminActor, "ADMIN", `draw-${draw}`), tournamentId, revision, { type: "DRAW_AUCTION", payload: {} }); revision = result.revision;
      }
      const aggregate = (await adapter.getAdmin(tournamentId))!;
      const participant = aggregate.participants.find((entry) => entry.auctionStatus === "DRAWN")!;
      const compatible = aggregate.teams.find((team) => {
        const roster = aggregate.participants.filter((entry) => entry.teamId === team.id);
        return roster.length < 5 && !roster.some((entry) => entry.position === participant.position);
      });
      assert.ok(compatible);
      if (draw === 0) await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "overspend"), tournamentId, revision, { type: "SELL_AUCTION", payload: { participantId: participant.id, teamId: compatible.id, purchasePoints: compatible.remainingAuctionPoints } }), /최소 입찰가/);
      result = await service.executeAdmin(context(adminActor, "ADMIN", `sell-${draw}`), tournamentId, revision, { type: "SELL_AUCTION", payload: { participantId: participant.id, teamId: compatible.id, purchasePoints: 1 } }); revision = result.revision;
    }
    result = await service.executeAdmin(context(adminActor, "ADMIN", "preliminary"), tournamentId, revision, { type: "PUBLISH_PRELIMINARY", payload: {} }); revision = result.revision;
    let aggregate = (await adapter.getAdmin(tournamentId))!;
    assert.equal(aggregate.preliminaryFixtures.length, 6);
    assert.ok(aggregate.teams.every((team) => team.confirmed));

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
    result = await service.executeAdmin(context(adminActor, "ADMIN", "correct-prelim-after-publish"), tournamentId, revision, { type: "CORRECT_PRELIMINARY_RESULT", payload: { fixtureId: revoteFixture.id, teamAScore: 0, teamBScore: 1, winnerTeamId: revoteFixture.teamBId } }); revision = result.revision;
    assert.equal(result.body.status, "PRELIMINARY");
    assert.equal((await adapter.getAdmin(tournamentId))?.tournamentBracket, null);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "correct-prelim-mvp"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: revoteFixture.id, playerId: candidate } }); revision = result.revision;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "republish-tournament"), tournamentId, revision, { type: "PUBLISH_TOURNAMENT", payload: {} }); revision = result.revision;
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
      if (ballot.participantPlayerIds.includes(extraPlayerId)) {
        assert.equal(await adapter.getOwnApplication(tournamentId, extraOwnerId), null);
        assert.ok((await adapter.getOwnMvpBallots(tournamentId, extraOwnerId)).some((entry) => entry.fixtureId === fixture.id), "replacement can vote without a recruitment application");
      }
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
    assert.equal(aggregate.rosterSnapshots.some((entry) => entry.fixtureId === final.id), false, "invalidated final cannot retain a snapshot of the old finalists");
    const correctionAudit = (await database.select().from(auditEvents).where(eq(auditEvents.action, "DESTRUCTION_CORRECT_TOURNAMENT_RESULT")))[0];
    assert.ok(JSON.stringify(correctionAudit?.metadataJson).includes(final.id), "superseded final snapshot remains in the audit history");
    ballot = aggregate.mvpBallots.find((entry) => entry.fixtureId === firstSemi.id)!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "corrected-semi-mvp"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: firstSemi.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    final = (await adapter.getAdmin(tournamentId))!.tournamentBracket!.fixtures.find((entry) => entry.stage === "FINAL")!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final-again"), tournamentId, revision, { type: "RECORD_TOURNAMENT_RESULT", payload: { fixtureId: final.id, teamAScore: 2, teamBScore: 0, winnerTeamId: final.teamAId } }); revision = result.revision;
    ballot = (await adapter.getAdmin(tournamentId))!.mvpBallots.find((entry) => entry.fixtureId === final.id)!;
    result = await service.executeAdmin(context(adminActor, "ADMIN", "final-mvp-again"), tournamentId, revision, { type: "ASSIGN_MVP", payload: { fixtureId: final.id, playerId: ballot.participantPlayerIds[0] } }); revision = result.revision;
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "complete-invalid-gallery"), tournamentId, revision, { type: "COMPLETE_DESTRUCTION", payload: { galleryId: emptyGalleryId } }), /INVALID_GALLERY/);
    result = await service.executeAdmin(context(adminActor, "ADMIN", "complete"), tournamentId, revision, { type: "COMPLETE_DESTRUCTION", payload: { galleryId } }); revision = result.revision;
    assert.equal(result.body.status, "COMPLETED");
    await assert.rejects(service.executeAdmin(context(adminActor, "ADMIN", "reset-after-completion"), tournamentId, revision, { type: "RESET_MVP", payload: { fixtureId: final.id } }), /진행 중인 대회/);

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
    assert.equal((await database.select().from(destructionApplicationIndex).where(eq(destructionApplicationIndex.tournamentId, tournamentId))).length, 20);
    const receipts = await database.select().from(destructionCommandReceipts);
    assert.equal((await database.select().from(destructionOutbox)).length, receipts.length);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "DESTRUCTION"))).length, receipts.length);
    await assert.rejects(database.delete(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)));
  } finally { await pool.end(); }
});
