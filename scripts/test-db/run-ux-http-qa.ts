import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { startEphemeralCluster, stopAndRemoveCluster, childTestEnvironment } from "./run-data-contracts";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { authSessions, eventCompetitions, recruitParties, seasons, userAccounts, players, playerSeasonStats, seasonProjectionStates } from "../../src/platform/db/schema";
import { createEventAggregate, startEventRecruitment } from "../../src/modules/competitions/events/domain/event";
import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { ADMIN_SESSION_COOKIE_NAME } from "../../src/modules/auth/infrastructure/session-constants";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { eq } from "drizzle-orm";

const output = resolve(".tmp/ux-qa");
await mkdir(output, { recursive: true });
const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined;
try {
  await applyMigrations(database);
  const now = new Date(Math.floor(Date.now() / 1000) * 1000), past = new Date(now.getTime() - 3600_000), future = new Date(now.getTime() + 7 * 86_400_000);
  const seasonId = randomUUID();
  await database.insert(seasons).values({ id: seasonId, name: "UX 검증 시즌", nameNormalized: "ux 검증 시즌", status: "ACTIVE", activatedAt: past, applicationsOpenAt: past, applicationsCloseAt: future });
  if (process.env.V2_UX_QA_RANKING === "true") {
    // Synthetic projection fixture, only inside this harness's ephemeral cluster.
    const fixture = [
      { nickname: "달빛소환사", totalGames: 20, wins: 16, mvpCount: 5 },
      { nickname: "오늘도협곡으로출발하는플레이어", totalGames: 40, wins: 24, mvpCount: 7 },
      { nickname: "별빛정글러", totalGames: 30, wins: 21, mvpCount: 12 },
    ].map((row) => ({ ...row, id: randomUUID() }));
    await database.insert(players).values(fixture.map((row, index) => ({ id: row.id, nickname: row.nickname, nicknameNormalized: row.nickname, memberName: `합성회원${index}`, memberNameNormalized: `합성회원${index}`, tagLine: `QA${index}`, tagLineNormalized: `qa${index}`, status: "ACTIVE" as const })));
    await database.insert(seasonProjectionStates).values({ seasonId, generation: 1, status: "READY", sourceChecksum: randomBytes(32), calculatedAt: now });
    await database.insert(playerSeasonStats).values(fixture.map((row) => ({ seasonId, playerId: row.id, generation: 1, totalGames: row.totalGames, participationCount: row.totalGames, wins: row.wins, losses: row.totalGames - row.wins, mvpCount: row.mvpCount, calculatedAt: now })));
  }
  const partyId = randomUUID();
  await database.insert(recruitParties).values({ id: partyId, recruitDate: now.toISOString().slice(0,10), recruitNumber: 12, type: "PARTY_NUMBER", status: "IN_PROGRESS", title: "테스트 파티 모집", maximumMembers: 5, membersJson: [], lastActivityAt: now });
  const secret = randomBytes(32), cron = randomBytes(32).toString("hex"), userId = randomUUID(), sessionId = randomUUID();
  const themeQa = process.env.V2_UX_QA_THEME === "true";
  const totpKeysJson = JSON.stringify({ current: 1, keys: { 1: randomBytes(32).toString("base64url") } });
  await database.insert(userAccounts).values({ id: userId, loginId: "ux-admin", loginIdNormalized: "ux-admin", role: "ADMIN", status: "APPROVED", ...(themeQa ? { passwordHash: await hashPassword("QaOnlyPass2026!"), passwordChangedAt: now } : {}) });
  if (themeQa) {
    // Disposable UI fixture only; exercise the normal account/admin password sign-in.
    await database.update(players).set({ userAccountId: userId }).where(eq(players.nickname, "달빛소환사"));
  }
  const initialEvent = startEventRecruitment(createEventAggregate({ id: randomUUID(), now: now.toISOString(), settings: { title: "UX 검증 이벤트", description: "로컬 합성 데이터입니다.", format: "ARAM", recruitmentOpensAt: past.toISOString(), recruitmentClosesAt: future.toISOString(), bracketBestOf: 1 } }), now.toISOString());
  const event = { ...initialEvent, revision: 1 };
  await database.insert(eventCompetitions).values({ id: event.id, title: event.settings.title, titleNormalized: event.settings.title.toLowerCase(), description: event.settings.description, format: event.settings.format, status: event.lifecycle.status, recruitmentOpensAt: past, recruitmentClosesAt: future, bracketBestOf: 1, aggregateJson: JSON.parse(JSON.stringify(event)), revision: event.revision, createdAt: now, updatedAt: now, createdByUserAccountId: userId, updatedByUserAccountId: userId });
  const codec = new JoseSessionCodec({ currentKeyId: "qa", keys: new Map([["qa", secret]]) });
  const token = await codec.encode({ userId, role: "ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false, authVersion: 0, adminTotpVerified: false, source: "database" }, { sessionId, nowMs: now.getTime(), ttlSeconds: 1800 });
  await database.insert(authSessions).values({ id: sessionId, tokenHash: hashSessionToken(token), userAccountId: userId, authVersion: 0, role: "ADMIN", purpose: "ADMIN", issuedAt: now, expiresAt: new Date(now.getTime() + 1800_000) });
  const portServer = createServer(); portServer.listen(0, "127.0.0.1"); await once(portServer, "listening");
  const address = portServer.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((done) => portServer.close(() => done()));
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(address.port)], { windowsHide: true, stdio: "ignore", env: { ...childTestEnvironment(cluster.connectionString), NODE_ENV: "production", V2_PUBLIC_DATA_SOURCE: "postgres", V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin, CRON_SECRET: cron, SESSION_SIGNING_KEYS: JSON.stringify({ current: "qa", keys: { qa: secret.toString("base64url") } }), TOTP_ENCRYPTION_KEYS: totpKeysJson, V2_AUTH_RATE_LIMIT_PEPPER: randomBytes(32).toString("base64url") } });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 300));
  }
  assert.ok(ready, "Local QA server starts");
  const input = { nickname: "UX 테스트", replyTo: "ux@example.invalid", category: "오류 신고", content: "합성 데이터 문의 본문", consent: true };
  const key = `ux-support-${randomUUID()}`;
  const post = (body: unknown, headers: Record<string,string> = {}) => fetch(`${origin}/api/support`, { method: "POST", headers: { origin, "Content-Type": "application/json", "Idempotency-Key": key, ...headers }, body: JSON.stringify(body) });
  assert.equal((await post(input, { origin: "https://foreign.invalid" })).status, 403);
  assert.equal((await post({ ...input, consent: false })).status, 400);
  assert.equal((await post({ ...input, adminNote: "injection" })).status, 400);
  assert.equal((await post({ ...input, content: "x".repeat(25_000) })).status, 413);
  const first = await post(input), replay = await post(input);
  assert.equal(first.status, 201); assert.equal(replay.status, 201);
  assert.match(first.headers.get("cache-control") ?? "", /no-store/);
  const receipt = await first.json() as { receiptId: string };
  assert.deepEqual(await replay.json(), receipt);
  assert.equal((await post({ ...input, content: "changed" })).status, 409);
  assert.equal((await fetch(`${origin}/api/admin/operation-forms`)).status, 401);
  const adminHeaders = { cookie: `${ADMIN_SESSION_COOKIE_NAME}=${token}` };
  const list = await fetch(`${origin}/api/admin/operation-forms?type=suggestions`, { headers: adminHeaders });
  assert.equal(list.status, 200); assert.match(await list.text(), /합성 데이터 문의 본문/);
  const audit = await pool.query("select before_json,after_json from audit.events where target_id=$1", [receipt.receiptId]);
  assert.ok(!JSON.stringify(audit.rows).includes(input.content));
  assert.equal((await fetch(`${origin}/api/cron/support-retention`)).status, 401);
  const cronResponse = await fetch(`${origin}/api/cron/support-retention`, { headers: { authorization: `Bearer ${cron}` } });
  assert.equal(cronResponse.status, 200);
  const robots = await fetch(`${origin}/robots.txt`); assert.equal(robots.status, 200); assert.match(await robots.text(), /sitemap.xml/);
  const sitemap = await fetch(`${origin}/sitemap.xml`); assert.equal(sitemap.status, 200); assert.doesNotMatch(await sitemap.text(), /\/help\/contact|\/matches\/submissions/);
  const eventHtml = await (await fetch(`${origin}/competitions/events/${event.id}`)).text();
  assert.match(eventHtml, /UX 검증 이벤트/); assert.match(eventHtml, /로그인하고 신청하기/);
  const signup = await fetch(`${origin}/api/auth/signup`, { method: "POST", headers: { origin, "Content-Type": "application/json", "Idempotency-Key": `qa-signup-${randomUUID()}` }, body: JSON.stringify({ loginId: "uxqa-member", password: "QaOnlyPass2026!", memberName: "테스트회원", riotId: "UX테스트#QA01", termsAccepted: true, privacyAccepted: true }) });
  assert.equal(signup.status, 201);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed: true, origin, eventId: event.id, partyId, checks: ["origin", "input-consent", "bounded-body", "idempotency", "private-admin-access", "redacted-audit", "cron-auth", "robots-sitemap", "event-login", "signup"] }, null, 2));
  console.log(`[ux-qa] HTTP checks passed. Browser fixture: ${origin}`);
  if (process.env.V2_UX_QA_HOLD === "true") {
    console.log("[ux-qa] Holding isolated fixture until .tmp/ux-qa/stop is created.");
    for (;;) { try { await access(resolve(output, "stop")); break; } catch { await new Promise((done) => setTimeout(done, 1000)); } }
  }
} finally {
  if (app && app.exitCode === null) { const stopped = once(app, "exit"); app.kill(); await stopped; }
  await pool.end(); await stopAndRemoveCluster(cluster);
}
