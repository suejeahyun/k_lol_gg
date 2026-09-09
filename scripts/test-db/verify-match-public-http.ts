import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { PostgresMatchRepository } from "../../src/modules/matches/infrastructure/postgres-match-repository";
import { resolveChampionImageUrl } from "../../src/modules/champions/domain/champion-image";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { championCatalog, players, seasons, userAccounts } from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return server.close(() => reject(new Error("Unable to allocate a loopback port.")));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function startServer(environment: NodeJS.ProcessEnv, probePath: string) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(`${origin}${probePath}`);
      if (response.status > 0) return { child, origin };
    } catch { /* listener is not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await stopServer(child);
  throw new Error("Next.js did not become ready within 45 seconds.");
}

const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
const actorId = randomUUID();
const seasonId = randomUUID();
const playerRows = Array.from({ length: 10 }, (_, index) => ({
  id: randomUUID(), memberName: `HTTP 비공개 회원 ${index + 1}`, memberNameNormalized: `http-member-${index + 1}`,
  nickname: `HttpPlayer${index + 1}`, nicknameNormalized: `httpplayer${index + 1}`,
  tagLine: "TEST", tagLineNormalized: "test",
}));
const champions = playerRows.map((_, index) => ({ key: `httpchampion${index + 1}`, displayName: `HTTP Champion ${index + 1}`, imageUrl: null }));
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const sessionKey = randomBytes(32).toString("base64url");
const totpKey = randomBytes(32).toString("base64url");
const databaseAuthEnvironment = {
  DATABASE_URL: connectionString,
  V2_PUBLIC_DATA_SOURCE: "postgres",
  SESSION_SIGNING_KEYS: JSON.stringify({ current: "match-http", keys: { "match-http": sessionKey } }),
  TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: totpKey } }),
  V2_AUTH_RATE_LIMIT_PEPPER: randomBytes(32).toString("base64url"),
};

try {
  await applyMigrations(database);
  await database.insert(userAccounts).values({ id: actorId, loginId: `match-http-${actorId}`, loginIdNormalized: `match-http-${actorId}`, passwordHash: "$argon2id$v=19$synthetic", role: "ADMIN", status: "APPROVED" });
  await database.insert(seasons).values({ id: seasonId, name: "HTTP 공개 경기", nameNormalized: "http 공개 경기", status: "DRAFT" });
  await database.insert(players).values(playerRows);
  await database.insert(championCatalog).values(champions);
  const repository = new PostgresMatchRepository(database, { async assertAuthorized() {} });
  const command = (scope: string) => ({ actor: { userAccountId: actorId, sessionId: randomUUID(), purpose: "ADMIN" as const, requiredRole: "ADMIN" as const }, requestId: randomUUID(), scope, keyHash: createHash("sha256").update(`key:${scope}`).digest(), requestHash: createHash("sha256").update(`request:${scope}`).digest() });
  const game = { gameNumber: 1, durationSeconds: 1800, winnerTeam: "BLUE" as const, participants: playerRows.map((player, index) => ({ playerId: player.id, championKey: champions[index]!.key, team: index < 5 ? "BLUE" as const : "RED" as const, position: positions[index % 5]!, kills: index, deaths: 2, assists: 4 })) };
  const created = await repository.createMatch(command("match-http-create"), { seasonId, title: "HTTP 공개 경기", playedOn: "2026-09-09", startedAt: null, startedAtOffsetMinutes: null, games: [game] }, new Date("2026-09-09T00:00:00.000Z"));
  const matchId = String(created.body.id);
  await repository.publishMatch(command("match-http-publish"), matchId, 0, new Date("2026-09-09T00:01:00.000Z"));

  const repositoryMatch = await repository.getPublic(matchId);
  const repositoryParticipants = repositoryMatch?.games[0]?.participants ?? [];
  assert.equal(repositoryParticipants.length, 10);
  assert.deepEqual(repositoryParticipants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })), game.participants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })));
  const repositoryFallbackUrl = resolveChampionImageUrl(repositoryParticipants[0]?.championImageUrl, repositoryParticipants[0]?.championKey) ?? "";
  assert.match(repositoryFallbackUrl, /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/26\.18\.1\/img\/champion\//);
  process.stdout.write(`[match-public-http] PASS repository participantCount expected=10 actual=${repositoryParticipants.length}\n`);
  process.stdout.write(`[match-public-http] PASS repository kdaPreserved=true\n`);
  process.stdout.write(`[match-public-http] PASS repository dataDragonFallback=${repositoryFallbackUrl}\n`);

  const unavailableEnvironment = { ...process.env, NODE_ENV: "development" } as NodeJS.ProcessEnv;
  delete unavailableEnvironment.DATABASE_URL;
  delete unavailableEnvironment.V2_PUBLIC_DATA_SOURCE;
  const unavailable = await startServer(unavailableEnvironment, "/api/matches/not-a-uuid");
  try {
    const invalid = await fetch(`${unavailable.origin}/api/matches/not-a-uuid`);
    const unavailableResponse = await fetch(`${unavailable.origin}/api/matches/${randomUUID()}`);
    assert.equal(invalid.status, 400);
    assert.equal(unavailableResponse.status, 503);
    process.stdout.write(`[match-public-http] PASS invalidIdentifier expected=400 actual=${invalid.status}\n`);
    process.stdout.write(`[match-public-http] PASS unavailableService expected=503 actual=${unavailableResponse.status}\n`);
  } finally { await stopServer(unavailable.child); }

  const available = await startServer({ ...process.env, NODE_ENV: "development", ...databaseAuthEnvironment }, `/api/matches/${matchId}`);
  try {
    const existing = await fetch(`${available.origin}/api/matches/${matchId}`);
    const existingText = await existing.text();
    assert.equal(existing.status, 200, existingText);
    const payload = JSON.parse(existingText) as { match?: { games?: Array<{ participants?: Array<{ kills: number; deaths: number; assists: number; championImageUrl: string | null; championKey: string }> }> } };
    const participants = payload.match?.games?.[0]?.participants ?? [];
    assert.equal(participants.length, 10);
    assert.deepEqual(participants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })), game.participants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })));
    const fallbackUrl = resolveChampionImageUrl(participants[0]?.championImageUrl, participants[0]?.championKey) ?? "";
    assert.match(fallbackUrl, /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/26\.18\.1\/img\/champion\//);
    const missing = await fetch(`${available.origin}/api/matches/${randomUUID()}`);
    assert.equal(missing.status, 404);
    process.stdout.write(`[match-public-http] PASS publishedMatch expected=200 actual=${existing.status} participantCount=${participants.length} kdaPreserved=true dataDragonFallback=${fallbackUrl}\n`);
    process.stdout.write(`[match-public-http] PASS missingUuid expected=404 actual=${missing.status}\n`);
  } finally { await stopServer(available.child); }
} finally {
  await pool.end();
}
