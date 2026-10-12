import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } from "./run-data-contracts";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { championCatalog, matchGames, matchParticipants, matchSeries, operationForms, playerSeasonStats, players, recruitParties, seasonApplications, seasonInhouseRounds, seasonProjectionStates, seasons, userAccounts } from "../../src/platform/db/schema";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { parseSiteSupportInput, SITE_SUPPORT_SOURCE } from "../../src/modules/recruiting/operation-forms/site-support";
import { recruitingOperatingDateKey } from "../../src/modules/recruiting/domain/operating-day";

// Never load a real dotenv file or reuse an existing DATABASE_URL for this fixture.
assert.deepEqual((await readdir(process.cwd())).filter(name => name.startsWith(".env") && name !== ".env.example"), [], "Run in an environment-free checkout");
const output = resolve(".tmp/full-audit-fixes-qa", randomUUID());
await mkdir(output, { recursive: true });
const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined;
const log = createWriteStream(resolve(output, "server.log"));
try {
  await applyMigrations(database);
  const now = new Date(), past = new Date(now.getTime() - 3_600_000), future = new Date(now.getTime() + 7 * 86_400_000);
  const today = recruitingOperatingDateKey(now);
  const seasonId = randomUUID(), memberId = randomUUID(), adminId = randomUUID(), playerId = randomUUID(), claimPlayerId = randomUUID();
  const password = `Qa${randomBytes(18).toString("hex")}7!`, passwordHash = await hashPassword(password);
  await database.insert(userAccounts).values([
    { id: memberId, loginId: "qa-member", loginIdNormalized: "qa-member", role: "USER", status: "APPROVED", passwordHash, passwordChangedAt: now },
    { id: adminId, loginId: "qa-admin", loginIdNormalized: "qa-admin", role: "ADMIN", status: "APPROVED", passwordHash, passwordChangedAt: now },
  ]);
  await database.insert(seasons).values({ id: seasonId, name: "합성 검증 시즌", nameNormalized: "합성 검증 시즌", status: "ACTIVE", activatedAt: past, applicationsOpenAt: past, applicationsCloseAt: future });
  const roster = Array.from({ length: 10 }, (_, index) => ({ id: randomUUID(), nickname: `합성참가${index + 1}`, memberName: `합성 회원 ${index + 1}` }));
  await database.insert(players).values([
    { id: playerId, userAccountId: memberId, memberName: "원래 회원명", memberNameNormalized: "원래 회원명", nickname: "검증플레이어", nicknameNormalized: "검증플레이어", tagLine: "QA1", tagLineNormalized: "qa1", peakTier: "GOLD I", currentTier: "SILVER II", revision: 1 },
    { id: claimPlayerId, memberName: "연결 검토 회원", memberNameNormalized: "연결 검토 회원", nickname: "연결검토", nicknameNormalized: "연결검토", tagLine: "QA2", tagLineNormalized: "qa2" },
    ...roster.map(row => ({ ...row, nicknameNormalized: row.nickname, memberNameNormalized: row.memberName, tagLine: "QA1", tagLineNormalized: "qa1" })),
  ]);
  await database.insert(seasonInhouseRounds).values({ id: randomUUID(), seasonId, applyDate: today, recruitNo: 1, sourceRoomIdHash: randomBytes(32), mode: "RIFT", capacity: 10, startTimeText: "오늘 23시", sourceReferenceHash: randomBytes(32) });
  await database.insert(seasonApplications).values(roster.map(row => ({ id: randomUUID(), seasonId, playerId: row.id, applyDate: today, recruitNo: 1, mainPosition: "ALL" as const })));
  await database.insert(recruitParties).values({ id: randomUUID(), recruitDate: today, recruitNumber: 12, type: "PARTY_NUMBER", status: "IN_PROGRESS", title: "합성 파티 모집", maximumMembers: 5, membersJson: [], lastActivityAt: now });
  await database.insert(operationForms).values(Array.from({ length: 105 }, (_, index) => ({
    id: randomUUID(), formType: "suggestions" as const, status: "PENDING" as const,
    payloadJson: parseSiteSupportInput({ nickname: `합성 문의 ${String(index + 1).padStart(3, "0")}`, replyTo: "fixture@example.invalid", category: "오류 신고", content: `합성 문의 본문 ${index + 1}. 실제 개인정보가 없는 검증 자료입니다.`, consent: true }),
    sourceRoomId: SITE_SUPPORT_SOURCE, sourceSenderId: `qa-${index}`, submittedAt: new Date(now.getTime() - index * 1000),
  })));
  // Five real relational recent-match rows exercise the narrow mobile profile layout.
  await database.insert(championCatalog).values({ key: "ahri", displayName: "아리" }).onConflictDoNothing();
  for (let index = 0; index < 5; index++) {
    const seriesId = randomUUID(), gameId = randomUUID();
    const title = `긴 경기 제목과 팀 이름이 함께 표시되는 합성 최근 경기 ${index + 1}`;
    await database.insert(matchSeries).values({ id: seriesId, seasonId, title, titleNormalized: title, playedOn: today, blueWins: 1, redWins: 0, gameCount: 1, status: "PUBLISHED", publishedAt: now });
    await database.insert(matchGames).values({ id: gameId, seriesId, gameNumber: 1, durationSeconds: 1800, winnerTeam: "BLUE", mvpPlayerId: playerId, mvpScoreUnits2: 30, mvpFormulaVersion: "V1_COMPAT_1", mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1" });
    await database.insert(matchParticipants).values({ id: randomUUID(), gameId, playerId, nicknameSnapshot: "검증플레이어", tagLineSnapshot: "QA1", championKey: "ahri", team: "BLUE", position: "MID", kills: 10, deaths: 2, assists: 8, mvpScoreUnits2: 30, mvpFormulaVersion: "V1_COMPAT_1" });
  }
  await database.insert(seasonProjectionStates).values({ seasonId, generation: 1, status: "READY", sourceChecksum: randomBytes(32), calculatedAt: now });
  await database.insert(playerSeasonStats).values({ seasonId, playerId, generation: 1, totalGames: 5, participationCount: 5, wins: 5, losses: 0, mvpCount: 5, calculatedAt: now });

  const portServer = createServer(); portServer.listen(0, "127.0.0.1"); await once(portServer, "listening");
  const address = portServer.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>(done => portServer.close(() => done()));
  const command = process.argv.includes("--production") ? "start" : "dev";
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", command, "--hostname", "127.0.0.1", "--port", String(address.port)], {
    windowsHide: true, stdio: ["ignore", log, log],
    env: { ...childTestEnvironment(cluster.connectionString), NODE_ENV: command === "start" ? "production" : "development", V2_PUBLIC_DATA_SOURCE: "postgres", V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin, CRON_SECRET: randomBytes(32).toString("hex"), SESSION_SIGNING_KEYS: JSON.stringify({ current: "qa", keys: { qa: randomBytes(32).toString("base64url") } }), TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: randomBytes(32).toString("base64url") } }), V2_AUTH_RATE_LIMIT_PEPPER: randomBytes(32).toString("base64url") },
  });
  await writeFile(resolve(output, "private.json"), JSON.stringify({ origin, databaseUrl: cluster.connectionString, account: { loginId: "qa-member", password }, admin: { loginId: "qa-admin", password }, signup: { loginId: "qa-new-member", password, memberName: "연결 검토 회원", riotId: "연결검토#QA2" }, seasonId, playerId, claimPlayerId, fullRecruit: "/applications?recruitNo=1", player: `/players/${playerId}`, accountPlayer: "/account/player", adminPlayer: `/admin/players/${playerId}`, duplicateSeasonName: "합성 검증 시즌", operationFormsCount: 105 }, null, 2), { mode: 0o600 });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (app.exitCode !== null) break;
    try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(ready, `Local QA server failed; inspect ${resolve(output, "server.log")}`);
  console.log(`[full-audit-fixes-qa] ready ${origin}`);
  console.log(`[full-audit-fixes-qa] private fixture ${resolve(output, "private.json")}`);
  console.log(`[full-audit-fixes-qa] stop by creating ${resolve(output, "stop")}`);
  for (;;) {
    if (app.exitCode !== null) throw new Error("QA server exited unexpectedly");
    try { await access(resolve(output, "stop")); break; } catch { await new Promise(done => setTimeout(done, 1000)); }
  }
} finally {
  if (app && app.exitCode === null) { const stopped = once(app, "exit"); app.kill(); await stopped; }
  log.end();
  await pool.end();
  await stopAndRemoveCluster(cluster);
}
