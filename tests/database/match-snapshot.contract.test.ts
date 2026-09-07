import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import type { MatchCommandEnvelope } from "../../src/modules/matches/application/ports/match-repository";
import type { MatchTransactionAuthorizer } from "../../src/modules/matches/application/ports/match-transaction-authorizer";
import { PostgresMatchRepository } from "../../src/modules/matches/infrastructure/postgres-match-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  championCatalog,
  matchAggregateVersions,
  matchGames,
  matchParticipants,
  matchRecalculationOutbox,
  matchSeries,
  matchSubmissionImages,
  matchSubmissions,
  players,
  privateAssets,
  seasons,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("S04 stores participant display identity and rejection reasons as durable history", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const noOpAuthorizer: MatchTransactionAuthorizer = {
    async assertAuthorized() {},
  };
  const repository = new PostgresMatchRepository(database, noOpAuthorizer);
  const now = new Date("2026-09-07T03:00:00.000Z");
  const actorId = randomUUID();
  const seasonId = randomUUID();
  const playerRows = Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(),
    memberName: `비공개 회원 ${index + 1}`,
    memberNameNormalized: `비공개 회원 ${index + 1}`,
    nickname: `당시닉${index + 1}`,
    nicknameNormalized: `당시닉${index + 1}`.toLocaleLowerCase("ko-KR"),
    tagLine: `OLD${index + 1}`,
    tagLineNormalized: `old${index + 1}`,
  }));
  const championRows = Array.from({ length: 10 }, (_, index) => ({
    key: `snapshot-champion-${index + 1}`,
    displayName: `스냅샷 챔피언 ${index + 1}`,
  }));
  const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
  const game = {
    gameNumber: 1,
    durationSeconds: 1800,
    winnerTeam: "BLUE" as const,
    participants: playerRows.map((player, index) => ({
      playerId: player.id,
      championKey: championRows[index]!.key,
      team: index < 5 ? "BLUE" as const : "RED" as const,
      position: positions[index % 5]!,
      kills: index,
      deaths: 2,
      assists: 4,
    })),
  };
  const preexistingPlayerId = randomUUID();

  function command(scope: string): MatchCommandEnvelope {
    return {
      actor: {
        userAccountId: actorId,
        sessionId: randomUUID(),
        purpose: "ADMIN",
        requiredRole: "ADMIN",
      },
      requestId: randomUUID(),
      scope,
      keyHash: createHash("sha256").update(`key:${scope}`).digest(),
      requestHash: createHash("sha256").update(`request:${scope}`).digest(),
    };
  }

  try {
    const partialMigrationFolder = await mkdtemp(join(tmpdir(), "klol-v2-s04-upgrade-"));
    try {
      const partialMetaFolder = join(partialMigrationFolder, "meta");
      await mkdir(partialMetaFolder);
      for (const fileName of [
        "0000_jazzy_genesis.sql",
        "0001_nappy_iron_fist.sql",
        "0002_player_registry_s02.sql",
        "0003_cooing_wolf_cub.sql",
        "0004_amusing_silver_surfer.sql",
      ]) {
        await copyFile(new URL(`../../drizzle/${fileName}`, import.meta.url), join(partialMigrationFolder, fileName));
      }
      const journal = JSON.parse(
        await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
      ) as { entries: unknown[]; version: string; dialect: string };
      await writeFile(
        join(partialMetaFolder, "_journal.json"),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, 5) }),
        "utf8",
      );
      await applyMigrations(database, partialMigrationFolder);
      await applyMigrations(database, partialMigrationFolder);
      await database.insert(players).values({
        id: preexistingPlayerId,
        memberName: "0005 이관 전 합성 회원",
        memberNameNormalized: "0005 이관 전 합성 회원",
        nickname: "BeforeS04",
        nicknameNormalized: "befores04",
        tagLine: "OLD",
        tagLineNormalized: "old",
      });
    } finally {
      await rm(partialMigrationFolder, { force: true, recursive: true });
    }

    const migrationSql = await readFile(
      new URL("../../drizzle/0005_s04_matches_results.sql", import.meta.url),
      "utf8",
    );
    assert.match(migrationSql, /pg_available_extensions/);
    assert.match(migrationSql, /has_database_privilege/);
    assert.match(migrationSql, /CREATE EXTENSION IF NOT EXISTS "pg_trgm"/);

    await applyMigrations(database);
    await applyMigrations(database);
    const migrationRows = await pool.query<{ count: number }>(
      "select count(*)::int as count from drizzle.__drizzle_migrations",
    );
    assert.equal(migrationRows.rows[0]?.count, 6);
    const extensionRows = await pool.query<{ version: string }>(
      "select extversion as version from pg_extension where extname = 'pg_trgm'",
    );
    assert.equal(extensionRows.rowCount, 1);
    const preserved = await database
      .select({ id: players.id, nickname: players.nickname })
      .from(players)
      .where(eq(players.id, preexistingPlayerId));
    assert.deepEqual(preserved, [{ id: preexistingPlayerId, nickname: "BeforeS04" }]);
    await database.insert(userAccounts).values({
      id: actorId,
      loginId: `match-snapshot-${actorId}`,
      loginIdNormalized: `match-snapshot-${actorId}`,
      passwordHash: "$argon2id$v=19$synthetic-contract-only",
      role: "ADMIN",
      status: "APPROVED",
    });
    await database.insert(seasons).values({
      id: seasonId,
      name: `경기 스냅샷 ${seasonId}`,
      nameNormalized: `경기 스냅샷 ${seasonId}`.toLocaleLowerCase("ko-KR"),
      status: "DRAFT",
    });
    await database.insert(players).values(playerRows);
    await database.insert(championCatalog).values(championRows);

    await t.test("registry rename does not rewrite a recorded participant or its archived revision", async () => {
      const created = await repository.createMatch(command("snapshot:create"), {
        seasonId,
        title: "당시 표시명 경기",
        playedOn: "2026-09-07",
        startedAt: null,
        startedAtOffsetMinutes: null,
        games: [game],
      }, now);
      const matchId = String(created.body.id);
      await repository.publishMatch(command("snapshot:publish"), matchId, 0, now);
      await database
        .update(players)
        .set({
          nickname: "현재닉1",
          nicknameNormalized: "현재닉1",
          tagLine: "NEW1",
          tagLineNormalized: "new1",
        })
        .where(eq(players.id, playerRows[0]!.id));

      const publicBeforeAmendment = await repository.getPublic(matchId);
      const firstBeforeAmendment = publicBeforeAmendment?.games[0]?.participants.find(
        (participant) => participant.playerId === playerRows[0]!.id,
      );
      assert.equal(firstBeforeAmendment?.nickname, "당시닉1");
      assert.equal(firstBeforeAmendment?.tagLine, "OLD1");

      const searched = await repository.listPublic({
        query: "당시 표시명",
        sort: "playedOn",
        order: "desc",
        page: 1,
        pageSize: 12,
      });
      assert.deepEqual(searched.items.map((item) => item.id), [matchId]);

      await pool.query("analyze competition.match_series");
      const explainClient = await pool.connect();
      try {
        await explainClient.query("begin");
        await explainClient.query(
          `insert into competition.match_series
             (id, season_id, title, title_normalized, played_on, blue_wins, red_wins, game_count, status)
           select md5('s04-explain-' || value::text)::uuid,
                  $1,
                  '검색 계획 합성 경기 ' || value::text,
                  '검색 계획 합성 경기 ' || value::text,
                  '2026-09-06'::date,
                  1,
                  0,
                  1,
                  'DRAFT'
             from generate_series(1, 5000) as value`,
          [seasonId],
        );
        await explainClient.query("analyze competition.match_series");
        await explainClient.query("drop index competition.match_series_public_title_idx");
        await explainClient.query("drop index competition.match_series_title_normalized_idx");
        await explainClient.query("set local enable_seqscan = off");
        await explainClient.query("set local enable_indexscan = off");
        const explained = await explainClient.query(
          `explain (format json, costs off)
             select id
               from competition.match_series
              where title_normalized ilike $1 escape E'\\\\'`,
          ["%당시 표시명%"],
        );
        assert.match(JSON.stringify(explained.rows), /match_series_title_trgm_idx/);
        await explainClient.query("rollback");
      } finally {
        explainClient.release();
      }

      const storedMvp = await database
        .select({ playerId: matchGames.mvpPlayerId, selection: matchGames.mvpSelection })
        .from(matchGames)
        .where(eq(matchGames.seriesId, matchId));
      assert.deepEqual(storedMvp, [{
        playerId: playerRows[4]!.id,
        selection: "WINNER_SCORE_KDA_PLAYER_ID_V1",
      }]);

      await repository.updateMatch(command("snapshot:amend-title"), matchId, 1, {
        seasonId,
        title: "제목만 교정한 경기",
        playedOn: "2026-09-07",
        startedAt: null,
        startedAtOffsetMinutes: null,
        games: [game],
      }, now);
      const stored = await database
        .select({
          playerId: matchParticipants.playerId,
          nicknameSnapshot: matchParticipants.nicknameSnapshot,
          tagLineSnapshot: matchParticipants.tagLineSnapshot,
        })
        .from(matchParticipants);
      const firstStored = stored.find((participant) => participant.playerId === playerRows[0]!.id);
      assert.deepEqual(firstStored, {
        playerId: playerRows[0]!.id,
        nicknameSnapshot: "당시닉1",
        tagLineSnapshot: "OLD1",
      });
      const archived = (
        await database
          .select({ snapshot: matchAggregateVersions.snapshotJson })
          .from(matchAggregateVersions)
          .where(eq(matchAggregateVersions.matchSeriesId, matchId))
      )[0]?.snapshot;
      assert.match(JSON.stringify(archived), /"nicknameSnapshot":"당시닉1"/);
      assert.doesNotMatch(JSON.stringify(archived), /현재닉1/);

      assert.deepEqual(await repository.getMatchSummaryIntegrity(null, 500), {
        ok: true,
        checkedCount: 1,
        nextAfter: null,
        sampleTruncated: false,
        samples: [],
      });
      await database
        .update(matchSeries)
        .set({ blueWins: 0, redWins: 1 })
        .where(eq(matchSeries.id, matchId));
      const inconsistent = await repository.getMatchSummaryIntegrity(null, 500);
      assert.equal(inconsistent.ok, false);
      assert.deepEqual(inconsistent.samples, [{
        matchId,
        stored: { gameCount: 1, blueWins: 0, redWins: 1 },
        actual: { gameCount: 1, blueWins: 1, redWins: 0 },
      }]);
      await database
        .update(matchSeries)
        .set({ blueWins: 1, redWins: 0 })
        .where(eq(matchSeries.id, matchId));
    });

    await t.test("reject after and reopen before audit snapshots retain the cleared public reason", async () => {
      const submissionId = randomUUID();
      const reason = "두 번째 경기 스코어보드가 없어 결과를 확인할 수 없습니다.";
      await database.insert(matchSubmissions).values({
        id: submissionId,
        publicCode: `MR2${createHash("sha256").update(submissionId).digest("hex").slice(0, 16).toUpperCase()}`,
        ownerUserAccountId: actorId,
        seasonId,
        title: "거절 사유 감사 접수",
        organizer: "진행자",
        seriesNumber: 1,
        playedOn: "2026-09-07",
        expectedGameCount: 2,
        source: "WEB",
        sourceReferenceHash: createHash("sha256").update(`submission:${submissionId}`).digest(),
        status: "PENDING_REVIEW",
      });
      await repository.rejectSubmission(command("snapshot:reject"), submissionId, 0, reason, now);
      await repository.reopenSubmission(command("snapshot:reopen"), submissionId, 1, now);

      const events = await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.targetId, submissionId));
      const rejected = events.find((event) => event.action === "MATCH_SUBMISSION_REJECTED");
      const reopened = events.find((event) => event.action === "MATCH_SUBMISSION_REOPENED");
      assert.equal(rejected?.afterJson?.publicReviewReason, reason);
      assert.equal(reopened?.beforeJson?.publicReviewReason, reason);
      assert.equal(reopened?.afterJson?.publicReviewReason, null);
    });

    await t.test("submission approval carries team-balance provenance through match history and outbox", async () => {
      const submissionId = randomUUID();
      const teamBalanceDraftId = randomUUID();
      const reviewedGames = [
        game,
        { ...game, gameNumber: 2, winnerTeam: "RED" as const },
      ];
      await database.insert(matchSubmissions).values({
        id: submissionId,
        publicCode: `MR2${createHash("sha256").update(submissionId).digest("hex").slice(0, 16).toUpperCase()}`,
        ownerUserAccountId: actorId,
        seasonId,
        title: "팀 밸런스 출처 접수",
        organizer: "진행자",
        seriesNumber: 2,
        playedOn: "2026-09-07",
        expectedGameCount: 2,
        teamBalanceDraftId,
        source: "WEB",
        sourceReferenceHash: createHash("sha256").update(`approval:${submissionId}`).digest(),
        reviewedResultJson: { formulaVersion: "V1_COMPAT_1", games: reviewedGames },
        status: "PENDING_REVIEW",
      });
      const assets = [1, 2].map((gameNumber) => ({
        id: randomUUID(),
        createdByUserAccountId: actorId,
        ingestSource: "WEB_USER" as const,
        storageProvider: "CONTRACT",
        storageKey: `contract/match-provenance/${submissionId}/${gameNumber}`,
        originalFileName: `game-${gameNumber}.png`,
        contentType: "image/png",
        byteSize: 32,
        width: 16,
        height: 16,
        sha256: createHash("sha256").update(`${submissionId}:${gameNumber}`).digest(),
        purpose: "MATCH_SCOREBOARD",
        status: "READY" as const,
        readyAt: now,
      }));
      await database.insert(privateAssets).values(assets);
      await database.insert(matchSubmissionImages).values(
        assets.map((asset, index) => ({
          id: randomUUID(),
          submissionId,
          privateAssetId: asset.id,
          gameNumber: index + 1,
          ocrStatus: "SUCCEEDED" as const,
          ocrCandidateJson: { schemaVersion: 1, participants: [] },
        })),
      );

      const approved = await repository.approveSubmission(
        command("provenance:approve"),
        submissionId,
        0,
        reviewedGames,
        now,
      );
      const matchId = String(approved.body.matchId);
      const storedMatch = (
        await database.select().from(matchSeries).where(eq(matchSeries.id, matchId))
      )[0];
      assert.equal(storedMatch?.teamBalanceDraftId, teamBalanceDraftId);

      await repository.updateMatch(command("provenance:amend"), matchId, 0, {
        seasonId,
        title: "출처를 유지한 교정",
        playedOn: "2026-09-07",
        startedAt: null,
        startedAtOffsetMinutes: null,
        games: reviewedGames,
      }, now);
      const amendedMatch = (
        await database.select().from(matchSeries).where(eq(matchSeries.id, matchId))
      )[0];
      assert.equal(amendedMatch?.teamBalanceDraftId, teamBalanceDraftId);

      const matchAudit = (
        await database
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.targetId, matchId))
      );
      const createdAudit = matchAudit.find((event) => event.action === "MATCH_CREATED_FROM_SUBMISSION");
      const amendedAudit = matchAudit.find((event) => event.action === "MATCH_AMENDED");
      assert.equal(createdAudit?.afterJson?.teamBalanceDraftId, teamBalanceDraftId);
      assert.equal(createdAudit?.metadataJson?.teamBalanceDraftId, teamBalanceDraftId);
      assert.equal(amendedAudit?.beforeJson?.teamBalanceDraftId, teamBalanceDraftId);
      assert.equal(amendedAudit?.afterJson?.teamBalanceDraftId, teamBalanceDraftId);

      const events = await database
        .select()
        .from(matchRecalculationOutbox)
        .where(eq(matchRecalculationOutbox.aggregateId, matchId));
      assert.ok(events.length >= 2);
      assert.ok(events.every((event) => event.teamBalanceDraftId === teamBalanceDraftId));
      assert.ok(events.every((event) => event.payloadJson.teamBalanceDraftId === teamBalanceDraftId));
    });
  } finally {
    await pool.end();
  }
});
