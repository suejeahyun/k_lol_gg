import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { asc, eq } from "drizzle-orm";

import type { MatchCommandEnvelope } from "../../src/modules/matches/application/ports/match-repository";
import type { MatchRecordInput } from "../../src/modules/matches/domain/match";
import { PostgresMatchRepository } from "../../src/modules/matches/infrastructure/postgres-match-repository";
import { PostgresMmrRepository } from "../../src/modules/mmr/infrastructure/postgres-mmr-repository";
import { MMR_FORMULA_VERSION } from "../../src/modules/mmr/domain/mmr-projection";
import { createDatabaseHandle, type V2Database } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import { championCatalog, matchGames, matchParticipants, matchRecalculationOutbox, matchSeries,
  mmrMatchGameSources, mmrMatchResultEvents, players, seasons, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

// Each regression owns a sibling database on the harness's synthetic loopback
// cluster, so its large ledger/old migration never affects other contracts.
async function isolated(work: (handle: ReturnType<typeof createDatabaseHandle>) => Promise<void>) {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated PostgreSQL harness is required.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_mmr_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_mmr_[a-f0-9]{16}$/u);
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(connectionString); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const handle = createDatabaseHandle(url.toString(), { max: 4 });
    try { await work(handle); } finally { await handle.pool.end(); }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
}

async function fixture(database: V2Database) {
  const now = new Date();
  const actorId = randomUUID(), seasonId = randomUUID();
  const members = Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(), memberName: `MMR history ${index}`, memberNameNormalized: `mmr history ${index}`,
    nickname: `History${index}`, nicknameNormalized: `history${index}`, tagLine: `H${index}`, tagLineNormalized: `h${index}`,
  }));
  const champions = members.map((_, index) => ({ key: `history-${index}`, displayName: `History champion ${index}` }));
  await database.insert(userAccounts).values({ id: actorId, loginId: "history-admin", loginIdNormalized: "history-admin", role: "ADMIN", status: "APPROVED" });
  await database.insert(seasons).values({ id: seasonId, name: "History season", nameNormalized: "history season", status: "ACTIVE", activatedAt: now });
  await database.insert(players).values(members);
  await database.insert(championCatalog).values(champions);
  const input: MatchRecordInput = {
    seasonId, title: "History match", playedOn: "2026-10-13", startedAt: null, startedAtOffsetMinutes: null,
    games: [1, 2].map((gameNumber) => ({ gameNumber, durationSeconds: 1800, winnerTeam: "BLUE",
      participants: members.map((member, index) => ({ playerId: member.id, championKey: champions[index]!.key,
        team: index < 5 ? "BLUE" : "RED", position: positions[index % 5]!, kills: index, deaths: 2, assists: 4 })) })),
  };
  const command = (scope: string): MatchCommandEnvelope => ({
    actor: { userAccountId: actorId, sessionId: randomUUID(), purpose: "ADMIN", requiredRole: "ADMIN" },
    requestId: randomUUID(), scope, keyHash: createHash("sha256").update(scope).digest(),
    requestHash: createHash("sha256").update(`request:${scope}`).digest(),
  });
  // Authorization is covered separately; this fixture targets the repository
  // transaction and all its real database constraints.
  const matches = new PostgresMatchRepository(database, { async assertAuthorized() {} });
  return { now, seasonId, members, champions, input, command, matches };
}

async function published(database: V2Database) {
  const data = await fixture(database);
  const created = await data.matches.createMatch(data.command("create-history"), data.input, data.now);
  const id = created.body.id as string;
  const result = await data.matches.publishMatch(data.command("publish-history"), id, created.revision!, data.now);
  return { ...data, id, revision: result.revision! };
}

test("0048 fresh/0047 upgrade preserve historical events and support the previous event-only writer", async () => {
  const temporaryRoot = resolve(".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(join(temporaryRoot, "mmr-history-migration-"));
  const journal = JSON.parse(await readFile(join(defaultMigrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((entry) => entry.tag === "0048_mmr-game-source-history");
  assert.ok(index > 0);
  try {
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }));
    for (const entry of journal.entries.slice(0, index)) await copyFile(join(defaultMigrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    for (const upgrade of [false, true]) await isolated(async ({ database, pool }) => {
      await applyMigrations(database, upgrade ? folder : defaultMigrationsFolder);
      const data = await published(database);
      const games = await database.select().from(matchGames).where(eq(matchGames.seriesId, data.id)).orderBy(asc(matchGames.gameNumber));
      const oldEvent = { id: randomUUID(), generation: 1, sourceEventId: data.id, matchId: data.id, gameId: games[0]!.id,
        gameNumber: 1, playerId: data.members[0]!.id, team: "BLUE", position: "TOP" as const, won: true,
        expectedWinRateBp: 5000, actualPerformanceBp: 6000, overallDeltaBp: 100, positionDeltaBp: 150,
        formulaVersion: MMR_FORMULA_VERSION, createdAt: data.now };
      await database.insert(mmrMatchResultEvents).values(oldEvent);
      const before = await database.select().from(mmrMatchResultEvents);
      await applyMigrations(database); await applyMigrations(database);
      assert.equal(Number((await pool.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
      assert.deepEqual(await database.select().from(mmrMatchResultEvents), before);
      const source = (await database.select().from(mmrMatchGameSources))[0]!;
      assert.equal(source.sourceKind, "LEGACY_EVENT_REFERENCE");
      assert.equal(source.sourceJson, null, "migration must not fabricate prior KDA from the mutable live ledger");
      assert.equal(source.gameId, oldEvent.gameId);
      // Simulate the exact previous writer shape after migration, including a
      // second generation: it writes events only and knows no source table.
      await database.insert(mmrMatchResultEvents).values({ ...oldEvent, id: randomUUID(), generation: 2 });
      assert.equal((await database.select().from(mmrMatchGameSources)).length, 2);
      const amended = await data.matches.updateMatch(data.command("legacy-after-upgrade"), data.id, data.revision,
        { ...data.input, games: [data.input.games[0]!] }, data.now);
      assert.equal(amended.status, 200);
      assert.equal((await database.select().from(matchGames).where(eq(matchGames.id, oldEvent.gameId))).length, 0);
      assert.equal((await database.select().from(mmrMatchResultEvents)).length, 2);
      assert.equal((await database.select().from(mmrMatchGameSources)).length, 2);
      await assert.rejects(database.delete(mmrMatchGameSources).where(eq(mmrMatchGameSources.generation, 1)),
        "referenced historical sources must remain protected by RESTRICT");
    });
  } finally {
    const location = relative(temporaryRoot, resolve(folder));
    assert.ok(location.startsWith("mmr-history-migration-") && !location.includes(".."));
    await rm(folder, { recursive: true, force: true });
  }
});

test("MMR catches up after title/KDA edits, removed games and voids without changing earlier generations", async () => {
  await isolated(async ({ database }) => {
    await applyMigrations(database);
    const data = await published(database);
    const repository = new PostgresMmrRepository(database);
    assert.equal((await repository.catchUp(data.now)).generation, 1);
    const firstEvents = await database.select().from(mmrMatchResultEvents).orderBy(asc(mmrMatchResultEvents.id));
    const firstSources = await database.select().from(mmrMatchGameSources).orderBy(asc(mmrMatchGameSources.gameId));
    assert.equal(firstEvents.length, 20);
    assert.equal(firstSources.length, 2);
    assert.ok(firstSources.every((source) => source.sourceKind === "LEDGER_SNAPSHOT"));
    const firstJson = firstSources[0]!.sourceJson!;
    assert.equal((firstJson.participants as unknown[]).length, 10);

    const titleEdit = await data.matches.updateMatch(data.command("title-after-mmr"), data.id, data.revision,
      { ...data.input, title: "Updated title" }, data.now);
    assert.equal(titleEdit.status, 200, "the original title-only failure must remain fixed");
    assert.equal((await repository.catchUp(data.now)).generation, 2);
    const corrected: MatchRecordInput = { ...data.input, title: "Corrected and shortened", games: [{ ...data.input.games[0]!,
      winnerTeam: "RED", participants: data.input.games[0]!.participants.map((participant, index) => ({ ...participant, kills: index === 0 ? 40 : participant.kills })) }] };
    const editCommand = data.command("correct-remove-after-mmr");
    const amended = await data.matches.updateMatch(editCommand, data.id, titleEdit.revision!, corrected, data.now);
    assert.equal(amended.status, 200);
    assert.equal((await data.matches.updateMatch(editCommand, data.id, titleEdit.revision!, corrected, data.now)).replayed, true);
    assert.equal((await repository.catchUp(data.now)).generation, 3);
    assert.equal((await database.select().from(mmrMatchResultEvents).where(eq(mmrMatchResultEvents.generation, 3))).length, 10);
    const correctedSource = (await database.select().from(mmrMatchGameSources).where(eq(mmrMatchGameSources.generation, 3)))[0]!;
    assert.equal(correctedSource.sourceJson?.winnerTeam, "RED");
    assert.equal((correctedSource.sourceJson?.participants as { playerId: string; kills: number }[]).find((p) => p.playerId === data.members[0]!.id)?.kills, 40);
    assert.deepEqual(await database.select().from(mmrMatchResultEvents).where(eq(mmrMatchResultEvents.generation, 1)).orderBy(asc(mmrMatchResultEvents.id)), firstEvents);
    assert.deepEqual(await database.select().from(mmrMatchGameSources).where(eq(mmrMatchGameSources.generation, 1)).orderBy(asc(mmrMatchGameSources.gameId)), firstSources);
    for (const source of firstSources) assert.equal((await database.select().from(matchGames).where(eq(matchGames.id, source.gameId))).length, 0);
    assert.equal((await repository.getPlayer(data.members[0]!.id))?.sampleSize, 1);
    await data.matches.voidMatch(data.command("void-after-mmr"), data.id, amended.revision!, "Synthetic history regression", data.now);
    assert.equal((await repository.catchUp(data.now)).generation, 4);
    assert.equal((await database.select().from(mmrMatchGameSources).where(eq(mmrMatchGameSources.generation, 4))).length, 0);
    assert.equal(await repository.getPlayer(data.members[0]!.id), null);
    assert.deepEqual(await database.select().from(mmrMatchResultEvents).where(eq(mmrMatchResultEvents.generation, 1)).orderBy(asc(mmrMatchResultEvents.id)), firstEvents);
  });
});

test("MMR persists 410 games beyond the old bind limit and rolls back every batch on a late failure", async () => {
  await isolated(async ({ database, pool }) => {
    await applyMigrations(database);
    const data = await fixture(database);
    const series = Array.from({ length: 410 }, (_, index) => ({ id: randomUUID(), seasonId: data.seasonId,
      title: `Batch ${index}`, titleNormalized: `batch ${index}`, playedOn: "2026-10-13", blueWins: 1, redWins: 0,
      gameCount: 1, status: "PUBLISHED" as const, publishedAt: data.now }));
    const games = series.map((row) => ({ id: randomUUID(), seriesId: row.id, gameNumber: 1, durationSeconds: 1800,
      winnerTeam: "BLUE" as const, mvpPlayerId: data.members[0]!.id, mvpScoreUnits2: 20,
      mvpFormulaVersion: "V1_COMPAT_1", mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1" }));
    await database.insert(matchSeries).values(series);
    await database.insert(matchGames).values(games);
    const participants = games.flatMap((game) => data.members.map((member, index) => ({ id: randomUUID(), gameId: game.id,
      playerId: member.id, nicknameSnapshot: member.nickname, tagLineSnapshot: member.tagLine,
      championKey: data.champions[index]!.key, team: index < 5 ? "BLUE" as const : "RED" as const, position: positions[index % 5]!,
      kills: index, deaths: 2, assists: 4, mvpScoreUnits2: 10, mvpFormulaVersion: "V1_COMPAT_1" })));
    for (let offset = 0; offset < participants.length; offset += 1000) await database.insert(matchParticipants).values(participants.slice(offset, offset + 1000));
    const repository = new PostgresMmrRepository(database);
    assert.equal((await repository.catchUp(data.now)).generation, 1);
    assert.equal((await database.select().from(mmrMatchResultEvents)).length, 4100);
    assert.equal((await database.select().from(mmrMatchGameSources)).length, 410);
    assert.equal((await repository.getPlayer(data.members[0]!.id))?.sampleSize, 410);
    const firstState = await repository.getSummary();
    const firstEvents = await pool.query("select * from mmr.match_result_events order by id");
    const lateGame = games.find((game) => game.seriesId === [...series].sort((a, b) => a.id.localeCompare(b.id)).at(-1)!.id)!;
    await database.insert(matchRecalculationOutbox).values({ id: randomUUID(), aggregateType: "MATCH_SERIES", aggregateId: series[0]!.id,
      eventType: "MATCH_CHANGED", action: "AMENDED", dedupeKey: "late-batch-regression", matchRevision: 1,
      oldSeasonId: data.seasonId, newSeasonId: data.seasonId,
      oldOrderKey: `2026-10-13:${series[0]!.id}`, newOrderKey: `2026-10-13:${series[0]!.id}`,
      inputDigest: randomBytes(32), payloadJson: {}, status: "PENDING", availableAt: data.now, createdAt: data.now, updatedAt: data.now });
    // The final game's events occur after four full batches. A real server-side
    // failure must roll back prior events, source snapshots, profiles and state.
    assert.match(lateGame.id, /^[a-f0-9-]{36}$/u);
    await pool.query(`CREATE FUNCTION mmr.synthetic_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.generation = 2 AND NEW.game_id = '${lateGame.id}'::uuid THEN RAISE EXCEPTION 'synthetic late batch failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER synthetic_late_failure BEFORE INSERT ON mmr.match_result_events FOR EACH ROW EXECUTE FUNCTION mmr.synthetic_late_failure();`);
    await assert.rejects(repository.catchUp(data.now));
    assert.deepEqual((await pool.query("select * from mmr.match_result_events order by id")).rows, firstEvents.rows);
    for (const table of ["match_game_sources", "player_profiles", "player_position_profiles", "consumer_receipts"]) {
      assert.equal(Number((await pool.query(`select count(*) from mmr.${table} where generation = 2`)).rows[0].count), 0, `${table} must roll back`);
    }
    assert.equal(Number((await pool.query("select count(*) from mmr.projection_runs")).rows[0].count), 1);
    assert.equal(Number((await pool.query("select count(*) from mmr.outbox")).rows[0].count), 1);
    const failedState = await repository.getSummary();
    assert.equal(failedState.generation, firstState.generation);
    assert.equal(failedState.pendingSourceCount, 1);
    await pool.query("DROP TRIGGER synthetic_late_failure ON mmr.match_result_events; DROP FUNCTION mmr.synthetic_late_failure()");
    assert.equal((await repository.catchUp(data.now)).generation, 2);
    assert.equal((await database.select().from(mmrMatchResultEvents)).length, 8200);
    assert.equal((await database.select().from(mmrMatchGameSources)).length, 820);
    assert.equal((await repository.getSummary()).pendingSourceCount, 0);
  });
});
