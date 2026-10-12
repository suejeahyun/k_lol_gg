import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { serialize } from "pg-protocol";
import { startEphemeralCluster, stopAndRemoveCluster } from "../../../scripts/test-db/run-data-contracts.ts";
import { createDatabaseHandle } from "../../../src/platform/db/database.ts";
import { applyMigrations } from "../../../src/platform/db/migrate.ts";
import { PostgresMatchRepository } from "../../../src/modules/matches/infrastructure/postgres-match-repository.ts";
import { PostgresMmrRepository } from "../../../src/modules/mmr/infrastructure/postgres-mmr-repository.ts";
import { championCatalog, matchGames, matchParticipants, matchSeries, mmrMatchResultEvents, players, seasons, userAccounts } from "../../../src/platform/db/schema/index.ts";

const result = { environment: "ephemeral-loopback-postgresql-18-synthetic-only", coverage: "Repository data lifecycle; authentication deliberately stubbed as in existing match snapshot contract" };
let cluster;
let pool;
try {
  cluster = await startEphemeralCluster();
  const handle = createDatabaseHandle(cluster.connectionString);
  pool = handle.pool;
  const database = handle.database;
  await applyMigrations(database);
  const now = new Date();
  const actorId = randomUUID();
  const seasonId = randomUUID();
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: randomUUID(), memberName: `Audit ${index}`, memberNameNormalized: `audit ${index}`, nickname: `Audit${index}`, nicknameNormalized: `audit${index}`, tagLine: `A${index}`, tagLineNormalized: `a${index}` }));
  const champions = rows.map((_, index) => ({ key: `audit-champion-${index}`, displayName: `Audit champion ${index}` }));
  await database.insert(userAccounts).values({ id: actorId, loginId: "audit-admin", loginIdNormalized: "audit-admin", role: "ADMIN", status: "APPROVED" });
  await database.insert(seasons).values({ id: seasonId, name: "Audit season", nameNormalized: "audit season", status: "ACTIVE", activatedAt: now });
  await database.insert(players).values(rows);
  await database.insert(championCatalog).values(champions);
  const input = { seasonId, title: "Audit match", playedOn: "2026-10-13", startedAt: null, startedAtOffsetMinutes: null, games: [{ gameNumber: 1, durationSeconds: 1800, winnerTeam: "BLUE", participants: rows.map((row, index) => ({ playerId: row.id, championKey: champions[index].key, team: index < 5 ? "BLUE" : "RED", position: ["TOP", "JGL", "MID", "ADC", "SUP"][index % 5], kills: index, deaths: 2, assists: 4 })) }] };
  const command = (scope) => ({ actor: { userAccountId: actorId, sessionId: randomUUID(), purpose: "ADMIN", requiredRole: "ADMIN" }, requestId: randomUUID(), scope, keyHash: createHash("sha256").update(scope).digest(), requestHash: createHash("sha256").update(`request:${scope}`).digest() });
  const matches = new PostgresMatchRepository(database, { async assertAuthorized() {} });
  const created = await matches.createMatch(command("audit-create"), input, now);
  const matchId = created.body.id;
  const published = await matches.publishMatch(command("audit-publish"), matchId, created.revision, now);
  const beforeMmrEdit = await matches.updateMatch(command("audit-edit-before"), matchId, published.revision, { ...input, title: "Edit before MMR succeeds" }, now);
  assert.equal(beforeMmrEdit.status, 200);
  const mmr = await new PostgresMmrRepository(database).catchUp(now);
  assert.equal(mmr.kind, "REBUILT");
  const eventRows = await database.select().from(mmrMatchResultEvents);
  assert.equal(eventRows.length, 10);
  let editFailure;
  try {
    await matches.updateMatch(command("audit-edit-after"), matchId, beforeMmrEdit.revision, { ...input, title: "Title-only edit after MMR" }, now);
  } catch (error) {
    editFailure = { name: error.name, applicationCode: error.code ?? null, sqlstate: error.cause?.code, constraint: error.cause?.constraint };
  }
  assert.ok(editFailure, "Expected the match edit to fail after MMR.");
  assert.equal(editFailure.sqlstate, "23001");
  const storedMatch = (await database.select().from(matchSeries).where(eq(matchSeries.id, matchId)))[0];
  const storedGames = await database.select().from(matchGames).where(eq(matchGames.seriesId, matchId));
  const storedParticipants = await database.select().from(matchParticipants).where(eq(matchParticipants.gameId, storedGames[0].id));
  assert.equal(storedMatch.revision, beforeMmrEdit.revision);
  assert.equal(storedMatch.title, "Edit before MMR succeeds");
  assert.equal(storedParticipants.length, 10);
  const client = await pool.connect();
  let foreignKeyFailure;
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM competition.match_participants WHERE game_id = $1", [storedGames[0].id]);
    await client.query("DELETE FROM competition.match_games WHERE id = $1", [storedGames[0].id]);
  } catch (error) {
    foreignKeyFailure = { sqlstate: error.code, constraint: error.constraint };
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  assert.equal(foreignKeyFailure?.sqlstate, "23001");
  assert.equal(foreignKeyFailure?.constraint, "match_result_events_game_id_match_games_id_fk");
  result.matchEditAfterMmr = { editBeforeProjectionStatus: beforeMmrEdit.status, mmrGeneration: mmr.generation, resultEventCount: eventRows.length, editAfterProjectionFailure: editFailure, underlyingFailure: foreignKeyFailure, rollbackPreservedMatchAndParticipants: true };

  const boundary = [];
  for (const games of [409, 410]) {
    const query = drizzle.mock().insert(mmrMatchResultEvents).values(Array.from({ length: games * 10 }, () => ({ ...eventRows[0], id: randomUUID(), generation: 2 }))).toSQL();
    const wire = serialize.bind({ values: query.params.map(String) });
    const metrics = { games, eventRows: games * 10, parameterCount: query.params.length, serializedParameterFormatCount: wire.readUInt16BE(7), serializedValueCount: wire.readUInt16BE(9 + query.params.length * 2) };
    if (games === 410) {
      let failure;
      try { await pool.query(query.sql, query.params); }
      catch (error) { failure = { sqlstate: error.code, message: error.message }; }
      assert.equal(failure?.sqlstate, "08P01");
      metrics.databaseFailure = failure;
    }
    boundary.push(metrics);
  }
  result.mmrInsertBoundary = boundary;
  assert.equal((await database.select().from(mmrMatchResultEvents)).length, 10);
  result.boundaryFailurePreservedEvents = true;
} finally {
  await pool?.end();
  if (cluster) await stopAndRemoveCluster(cluster);
}
result.clusterStoppedAndRemoved = true;
await writeFile(resolve(import.meta.dirname, "data-reliability-reproductions.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
