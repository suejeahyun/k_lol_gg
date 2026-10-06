import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { PostgresMatchRepository } from "../../src/modules/matches/infrastructure/postgres-match-repository";
import { DATA_DRAGON_CHAMPIONS, DATA_DRAGON_VERSION } from "../../src/modules/champions/domain/data-dragon-catalog";
import { resolveChampionImageUrl } from "../../src/modules/champions/domain/champion-image";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { championCatalog, players, seasons, userAccounts } from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import sharp from "sharp";
import { MVP_FORMULA, type MatchSubmissionView } from "../../src/modules/matches/domain/match";

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
    cwd: process.cwd(), env: { ...environment, V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let diagnostics = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => { diagnostics = `${diagnostics}${chunk}`.slice(-16_000); });
  }
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(`${origin}${probePath}`);
      if (response.status > 0) return { child, origin, diagnostics: () => diagnostics };
    } catch { /* listener is not ready */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await stopServer(child);
  throw new Error("Next.js did not become ready within 45 seconds.");
}

const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
const actorId = randomUUID();
const adminPassword = randomBytes(24).toString("base64url");
const seasonId = randomUUID();
const playerRows = Array.from({ length: 10 }, (_, index) => ({
  id: randomUUID(), memberName: `HTTP 비공개 회원 ${index + 1}`, memberNameNormalized: `http-member-${index + 1}`,
  nickname: `HttpPlayer${index + 1}`, nicknameNormalized: `httpplayer${index + 1}`,
  tagLine: "TEST", tagLineNormalized: "test",
}));
const champions = playerRows.map((_, index) => {
  const champion = DATA_DRAGON_CHAMPIONS[index]!;
  return { key: champion.id.toLocaleLowerCase("en-US"), displayName: champion.name, imageUrl: null };
});
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
  await database.insert(userAccounts).values({ id: actorId, loginId: `match-http-${actorId}`, loginIdNormalized: `match-http-${actorId}`, passwordHash: await hashPassword(adminPassword), role: "ADMIN", status: "APPROVED" });
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
  assert.equal(repositoryFallbackUrl, `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/${DATA_DRAGON_CHAMPIONS[0]!.id}.png`);
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

  const available = await startServer({ ...process.env, NODE_ENV: "development", ...databaseAuthEnvironment, V2_FAKE_PRIVATE_ASSETS: "1" }, `/api/matches/${matchId}`);
  try {
    const login = await fetch(`${available.origin}/api/admin/login`, {
      method: "POST", headers: { "content-type": "application/json", origin: available.origin },
      body: JSON.stringify({ loginId: `match-http-${actorId}`, password: adminPassword }),
    });
    assert.equal(login.status, 200, await login.clone().text());
    const cookie = (login.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
    assert.match(cookie, /^klol_v2_session=/);
    // Exercise Next's real boundary selection, including resource misses and
    // query validation inside existing public/admin layouts. Next can deliver
    // not-found content through Flight after streaming the shell. Full fallback
    // composition is covered by not-found-layout.test.mjs and browser QA.
    const missingId = randomUUID();
    for (const route of [
      "/matches/submit?code=invalid",
      `/players/${missingId}`,
      `/matches/${missingId}`,
      `/missing-page-${missingId}`,
    ]) {
      const response = await fetch(`${available.origin}${route}`);
      const html = await response.text();
      assert.ok(response.status === 404 || (response.status === 200 && html.includes("NEXT_HTTP_ERROR_FALLBACK;404")), `${route}: not-found response or streamed 404 boundary`);
      assert.match(html, /<meta name="robots" content="noindex"/);
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
      assert.equal((markup.match(/data-ui-scope="public"/gu) ?? []).length, 1, `${route}: one public shell`);
      assert.equal((markup.match(/class="site-header"/gu) ?? []).length, 1, `${route}: one header`);
      assert.equal((markup.match(/class="site-footer"/gu) ?? []).length, 1, `${route}: one footer`);
      assert.equal((markup.match(/<main(?:\s|>)/gu) ?? []).length, 1, `${route}: one main landmark`);
      assert.equal((markup.match(/id="main-content"/gu) ?? []).length, 1, `${route}: one skip-link destination`);
      assert.match(html, /찾으시는 페이지가 없어요/u);
    }
    for (const route of [`/admin/matches/${missingId}`, `/admin/players/${missingId}`]) {
      const response = await fetch(`${available.origin}${route}`, { headers: { cookie } });
      const html = await response.text();
      assert.ok(response.status === 404 || (response.status === 200 && html.includes("NEXT_HTTP_ERROR_FALLBACK;404")), `${route}: not-found response or streamed 404 boundary`);
      assert.match(html, /<meta name="robots" content="noindex"/);
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
      // An async admin layout can be delivered wholly through Flight on a 404.
      // Do not treat this initial response as the final hydrated landmark tree.
      const adminShellCount = (markup.match(/data-ui-scope="admin"/gu) ?? []).length;
      assert.ok(adminShellCount === 1 || (adminShellCount === 0 && markup.includes('data-next-error-digest="NEXT_HTTP_ERROR_FALLBACK;404"')), `${route}: admin shell or explicit deferred 404 boundary`);
      assert.equal((markup.match(/data-ui-scope="public"/gu) ?? []).length, 0, `${route}: no nested public shell`);
      assert.match(html, route.includes("/players/") ? /등록부로 돌아가기/u : /관리 홈으로 돌아가기/u);
    }
    const protectedMissing = await fetch(`${available.origin}/admin/matches/${missingId}`, { redirect: "manual" });
    assert.equal(protectedMissing.status, 307);
    assert.ok(new URL(protectedMissing.headers.get("location")!, available.origin).pathname.endsWith("/login"));
    process.stdout.write("[not-found-http] PASS invalid submission, missing player/match, unmatched URL: noindex + 404 boundary + one initial public shell; admin missing match/player: 404 boundary, no nested public shell, recovery payload, anonymous login redirect (hydrated DOM requires separate browser QA)\n");
    const sessionRows = await pool.query("SELECT totp_verified_at FROM auth.sessions WHERE user_account_id=$1", [actorId]);
    assert.equal(sessionRows.rows.length, 1);
    assert.equal(sessionRows.rows[0].totp_verified_at, null);
    const createHeaders = { cookie, origin: available.origin, "content-type": "application/json", "if-match": '"0"', "idempotency-key": randomUUID() };
    const createBody = JSON.stringify({ title: "Password-only OCR import", seasonId: null, playedOn: "2026-10-01", startedAt: null });
    const imported = await fetch(`${available.origin}/api/admin/matches/import`, { method: "POST", headers: createHeaders, body: createBody });
    assert.equal(imported.status, 201, await imported.clone().text());
    const draft = await imported.json() as { submissionId: string; revision: number };
    const image = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "white" } }).png().toBuffer();
    const uploaded = await fetch(`${available.origin}/api/admin/matches/import`, {
      method: "PUT", headers: {
        cookie, origin: available.origin, "content-type": "image/png", "if-match": `"${draft.revision}"`,
        "idempotency-key": randomUUID(), "x-content-sha256": createHash("sha256").update(image).digest("hex"),
        "x-match-game-number": "1", "x-match-import-id": draft.submissionId, "x-upload-file-name": "synthetic.png",
      }, body: new Uint8Array(image),
    });
    assert.equal(uploaded.ok, true, await uploaded.clone().text());

    // Cover the owner-facing task chain through the real HTTP boundary. All
    // accounts, images and writes are confined to this disposable database.
    const ownerId = randomUUID(), otherId = randomUUID(), pendingId = randomUUID();
    await database.insert(userAccounts).values(await Promise.all([
      { id: ownerId, status: "APPROVED" as const },
      { id: otherId, status: "APPROVED" as const },
      { id: pendingId, status: "PENDING" as const },
    ].map(async (account) => ({ ...account, loginId: `owner-http-${account.id}`, loginIdNormalized: `owner-http-${account.id}`, role: "USER" as const, passwordHash: await hashPassword(adminPassword) }))));
    async function accountCookie(id: string) {
      const response = await fetch(`${available.origin}/api/auth/login`, { method: "POST", headers: { origin: available.origin, "content-type": "application/json" }, body: JSON.stringify({ loginId: `owner-http-${id}`, password: adminPassword }) });
      assert.equal(response.status, 200, await response.clone().text());
      const value = (response.headers.get("set-cookie") ?? "").split(";", 1)[0]!;
      assert.match(value, /^klol_v2_account_session=/);
      return value;
    }
    const ownerCookie = await accountCookie(ownerId), otherCookie = await accountCookie(otherId), pendingCookie = await accountCookie(pendingId);
    const commandHeaders = (sessionCookie: string, revision: number, key = randomUUID()) => ({ cookie: sessionCookie, origin: available.origin, "content-type": "application/json", "if-match": `"${revision}"`, "idempotency-key": key });
    const commandHttp = (route: string, method: string, body: unknown, sessionCookie: string, revision: number, key = randomUUID()) => fetch(`${available.origin}${route}`, { method, headers: commandHeaders(sessionCookie, revision, key), body: JSON.stringify(body) });
    async function expectStatus(response: Response, expected: number) {
      assert.equal(response.status, expected, await response.clone().text());
      return response;
    }
    async function ownSubmission(code: string) {
      const response = await expectStatus(await fetch(`${available.origin}/api/me/match-submissions/${code}`, { headers: { cookie: ownerCookie } }), 200);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      return (await response.json() as { submission: MatchSubmissionView }).submission;
    }
    for (const invalidId of ["잘못된주소", "BAD-IDENTIFIER", "x".repeat(130)]) {
      const invalid = await expectStatus(await commandHttp(`/api/admin/matches/${encodeURIComponent(invalidId)}/publish`, "POST", {}, cookie, 0), 400);
      assert.equal((await invalid.json() as { code: string }).code, "INVALID_INPUT");
    }
    process.stdout.write("[owner-task-http] PASS malformed dynamic mutation addresses return structured 400 without hashing exceptions\n");
    const submissionFields = { seasonId, title: "합성 회원 경기", organizer: "합성 주최자", seriesNumber: 1, note: null, playedOn: "2026-10-05", startedAt: null, expectedGameCount: 2, teamBalanceDraftId: null as string | null };
    const createSubmissionHttp = (fields = submissionFields, key = randomUUID(), requestId = randomUUID()) => commandHttp("/api/me/match-submissions", "POST", { ...fields, requestId }, ownerCookie, 0, key);
    await expectStatus(await commandHttp("/api/me/match-submissions", "POST", { ...submissionFields, requestId: randomUUID() }, pendingCookie, 0), 403);
    await expectStatus(await commandHttp("/api/me/match-submissions", "POST", { ...submissionFields, requestId: randomUUID() }, "", 0), 401);

    const creationKey = randomUUID(), creationRequest = randomUUID();
    const createdOwner = await expectStatus(await createSubmissionHttp(submissionFields, creationKey, creationRequest), 201);
    const firstSubmission = await createdOwner.json() as { submissionId: string; publicCode: string; revision: number };
    const createReplay = await expectStatus(await createSubmissionHttp(submissionFields, creationKey, creationRequest), 201);
    assert.equal(createReplay.headers.get("idempotency-replayed"), "true");
    assert.equal((await createReplay.json() as { submissionId: string }).submissionId, firstSubmission.submissionId);
    const firstRoute = `/api/me/match-submissions/${firstSubmission.publicCode}`;
    await expectStatus(await fetch(`${available.origin}${firstRoute}`, { headers: { cookie: otherCookie } }), 404);
    await expectStatus(await commandHttp("/api/me/match-submissions/invalid-code!", "PATCH", submissionFields, ownerCookie, 0), 404);
    await expectStatus(await commandHttp("/api/me/match-submissions/invalid-code!/cancel", "POST", {}, ownerCookie, 0), 404);
    const edits = await Promise.all(["합성 수정 A", "합성 수정 B"].map((title) => commandHttp(firstRoute, "PATCH", { ...submissionFields, title }, ownerCookie, firstSubmission.revision)));
    assert.deepEqual(edits.map((response) => response.status).sort(), [200, 412], "concurrent edits must commit once and reject the stale revision");
    let first = await ownSubmission(firstSubmission.publicCode);
    assert.equal(first.revision, firstSubmission.revision + 1);
    assert.ok(["합성 수정 A", "합성 수정 B"].includes(first.title));
    const updateKey = randomUUID(), updateRevision = first.revision, updatedFields = { ...submissionFields, title: "합성 수정 복구" };
    await expectStatus(await commandHttp(firstRoute, "PATCH", updatedFields, ownerCookie, updateRevision, updateKey), 200);
    const updateReplay = await expectStatus(await commandHttp(firstRoute, "PATCH", updatedFields, ownerCookie, updateRevision, updateKey), 200);
    assert.equal(updateReplay.headers.get("idempotency-replayed"), "true");
    first = await ownSubmission(firstSubmission.publicCode);
    assert.equal(first.title, "합성 수정 복구");

    async function uploadOwner(code: string, revision: number, gameNumber: number, key = randomUUID(), bytes = image) {
      return fetch(`${available.origin}/api/me/match-submissions/${code}/images`, { method: "POST", headers: {
        cookie: ownerCookie, origin: available.origin, "content-type": "image/png", "if-match": `"${revision}"`, "idempotency-key": key,
        "x-content-sha256": createHash("sha256").update(bytes).digest("hex"), "x-match-game-number": String(gameNumber), "x-upload-file-name": "synthetic-scoreboard.png",
      }, body: new Uint8Array(bytes) });
    }
    await expectStatus(await uploadOwner(first.publicCode, first.revision, 1, randomUUID(), Buffer.from("synthetic invalid image")), 400);
    assert.equal((await ownSubmission(first.publicCode)).revision, first.revision, "invalid uploads must not advance or destroy the submission");
    const uploadKey = randomUUID(), uploadRevision = first.revision;
    await expectStatus(await uploadOwner(first.publicCode, uploadRevision, 1, uploadKey), 201);
    const uploadReplay = await expectStatus(await uploadOwner(first.publicCode, uploadRevision, 1, uploadKey), 201);
    assert.equal(uploadReplay.headers.get("idempotency-replayed"), "true");
    first = await ownSubmission(first.publicCode);
    assert.deepEqual(first.receivedGameNumbers, [1]);
    const cancelKey = randomUUID(), cancelRevision = first.revision;
    await expectStatus(await commandHttp(`${firstRoute}/cancel`, "POST", {}, ownerCookie, cancelRevision, cancelKey), 200);
    const cancelReplay = await expectStatus(await commandHttp(`${firstRoute}/cancel`, "POST", {}, ownerCookie, cancelRevision, cancelKey), 200);
    assert.equal(cancelReplay.headers.get("idempotency-replayed"), "true");
    first = await ownSubmission(first.publicCode);
    assert.equal(first.status, "CANCELLED");
    await expectStatus(await uploadOwner(first.publicCode, first.revision, 2), 409);
    await expectStatus(await commandHttp(firstRoute, "PATCH", submissionFields, ownerCookie, first.revision), 409);
    const cancelledPage = await expectStatus(await fetch(`${available.origin}/matches/submit?code=${first.publicCode}`, { headers: { cookie: ownerCookie } }), 200);
    assert.match(await cancelledPage.text(), /취소된 접수에는 이미지를 추가할 수 없어요/);
    process.stdout.write("[owner-task-http] PASS submission create/replay, concurrent edit 200+412, recover/replay, invalid image recovery, upload replay, cancel/replay, terminal mutation denial\n");

    const teamBody = { title: "합성 회원 팀", participants: playerRows.map((player, index) => ({ playerId: player.id, eligiblePositions: [{ position: positions[index % 5]!, preference: "MAIN" }] })) };
    const teamKey = randomUUID();
    const teamCreate = await expectStatus(await commandHttp("/api/team-tools/drafts", "POST", teamBody, ownerCookie, 0, teamKey), 201);
    const team = await teamCreate.json() as { draftId: string; revision: number };
    const teamReplay = await expectStatus(await commandHttp("/api/team-tools/drafts", "POST", teamBody, ownerCookie, 0, teamKey), 201);
    assert.equal(teamReplay.headers.get("idempotency-replayed"), "true");
    assert.equal((await teamReplay.json() as { draftId: string }).draftId, team.draftId);
    const teamRoute = `/api/team-tools/drafts/${team.draftId}`;
    await expectStatus(await fetch(`${available.origin}${teamRoute}`, { headers: { cookie: otherCookie } }), 404);
    await expectStatus(await commandHttp(`${teamRoute}/save`, "POST", {}, otherCookie, 0), 404);
    const teamSaves = await Promise.all([randomUUID(), randomUUID()].map((key) => commandHttp(`${teamRoute}/save`, "POST", {}, ownerCookie, 0, key)));
    assert.deepEqual(teamSaves.map((response) => response.status).sort(), [200, 412]);
    const readTeam = async () => {
      const response = await expectStatus(await fetch(`${available.origin}${teamRoute}`, { headers: { cookie: ownerCookie } }), 200);
      return (await response.json() as { draft: { status: string; revision: number; selectedCandidateSignature: string; candidates: Array<{ signature: string; assignments: Array<{ playerId: string; team: "BLUE" | "RED"; position: typeof positions[number] }> }> } }).draft;
    };
    let savedTeam = await readTeam();
    assert.equal(savedTeam.status, "SAVED");
    assert.equal(savedTeam.revision, 1);
    const reevaluateKey = randomUUID();
    await expectStatus(await commandHttp(`${teamRoute}/reevaluate`, "POST", {}, ownerCookie, savedTeam.revision, reevaluateKey), 200);
    const reevaluateReplay = await expectStatus(await commandHttp(`${teamRoute}/reevaluate`, "POST", {}, ownerCookie, savedTeam.revision, reevaluateKey), 200);
    assert.equal(reevaluateReplay.headers.get("idempotency-replayed"), "true");
    savedTeam = await readTeam();
    const saveKey = randomUUID();
    await expectStatus(await commandHttp(`${teamRoute}/save`, "POST", {}, ownerCookie, savedTeam.revision, saveKey), 200);
    assert.equal((await expectStatus(await commandHttp(`${teamRoute}/save`, "POST", {}, ownerCookie, savedTeam.revision, saveKey), 200)).headers.get("idempotency-replayed"), "true");
    savedTeam = await readTeam();
    assert.equal(savedTeam.status, "SAVED");
    process.stdout.write("[owner-task-http] PASS team create/replay, cross-owner read/write denial, concurrent save 200+412, reevaluate/replay, refreshed save/replay\n");

    const nextFields = { ...submissionFields, title: "합성 새 경기", teamBalanceDraftId: team.draftId };
    const nextCreate = await expectStatus(await createSubmissionHttp(nextFields), 201);
    const nextSubmission = await nextCreate.json() as { submissionId: string; publicCode: string; revision: number };
    assert.notEqual(nextSubmission.publicCode, first.publicCode);
    const secondImage = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "gray" } }).png().toBuffer();
    for (const number of [1, 2]) {
      const current = await ownSubmission(nextSubmission.publicCode);
      if (number === 2) {
        await expectStatus(await uploadOwner(current.publicCode, current.revision, number), 409);
        assert.equal((await ownSubmission(current.publicCode)).revision, current.revision, "a duplicate scoreboard must leave the next game available");
      }
      await expectStatus(await uploadOwner(current.publicCode, current.revision, number, randomUUID(), number === 1 ? image : secondImage), 201);
    }
    let completed = await ownSubmission(nextSubmission.publicCode);
    assert.equal(completed.status, "PENDING_REVIEW");
    assert.equal(completed.teamBalanceDraftId, team.draftId);
    assert.deepEqual(completed.receivedGameNumbers, [1, 2]);
    const reviewRoute = `/api/admin/matches/submissions/${nextSubmission.submissionId}`;
    const reason = "합성 검토 사유: 점수판 확인 필요";
    await expectStatus(await commandHttp(`${reviewRoute}/reject`, "POST", { publicReason: reason }, cookie, completed.revision), 200);
    completed = await ownSubmission(nextSubmission.publicCode);
    assert.equal(completed.status, "REJECTED");
    assert.equal(completed.publicReviewReason, reason);
    const rejectedHtml = await (await expectStatus(await fetch(`${available.origin}/matches/submit?code=${completed.publicCode}`, { headers: { cookie: ownerCookie } }), 200)).text();
    assert.ok(rejectedHtml.includes(reason));
    await expectStatus(await commandHttp(`${reviewRoute}/reopen`, "POST", {}, cookie, completed.revision), 200);
    completed = await ownSubmission(nextSubmission.publicCode);
    assert.equal(completed.status, "PENDING_REVIEW");
    assert.equal(completed.publicReviewReason, null);
    const layout = savedTeam.candidates.find((candidate) => candidate.signature === savedTeam.selectedCandidateSignature)!.assignments;
    const reviewGame = { ...game, participants: game.participants.map((participant) => {
      const assignment = layout.find((entry) => entry.playerId === participant.playerId)!;
      return { ...participant, team: assignment.team, position: assignment.position };
    }) };
    await expectStatus(await commandHttp(`${reviewRoute}/review-draft`, "PUT", { seasonId, reviewedResult: { formulaVersion: MVP_FORMULA.version, games: [reviewGame, { ...reviewGame, gameNumber: 2, winnerTeam: "RED" }] } }, cookie, completed.revision), 200);
    completed = await ownSubmission(nextSubmission.publicCode);
    const approveKey = randomUUID(), approveRevision = completed.revision;
    const approved = await expectStatus(await commandHttp(`${reviewRoute}/approve`, "POST", {}, cookie, approveRevision, approveKey), 201);
    const approvedMatch = await approved.json() as { matchId: string };
    assert.equal((await expectStatus(await commandHttp(`${reviewRoute}/approve`, "POST", {}, cookie, approveRevision, approveKey), 201)).headers.get("idempotency-replayed"), "true");
    completed = await ownSubmission(nextSubmission.publicCode);
    assert.equal(completed.status, "APPROVED");
    assert.equal(completed.approvedMatchSeriesId, approvedMatch.matchId);
    await expectStatus(await fetch(`${available.origin}/api/matches/${approvedMatch.matchId}`), 200);
    const approvedHtml = await (await expectStatus(await fetch(`${available.origin}/matches/submit?code=${completed.publicCode}`, { headers: { cookie: ownerCookie } }), 200)).text();
    assert.ok(approvedHtml.includes(`/matches/${approvedMatch.matchId}`));
    await expectStatus(await commandHttp(`/api/me/match-submissions/${completed.publicCode}/cancel`, "POST", {}, ownerCookie, completed.revision), 409);
    await pool.query("UPDATE auth.sessions SET revoked_at=now() WHERE user_account_id=$1", [ownerId]);
    await expectStatus(await fetch(`${available.origin}${teamRoute}`, { headers: { cookie: ownerCookie } }), 401);
    await expectStatus(await commandHttp(`${teamRoute}/save`, "POST", {}, ownerCookie, savedTeam.revision, saveKey), 401);
    await expectStatus(await commandHttp(`/api/me/match-submissions/${completed.publicCode}/cancel`, "POST", {}, ownerCookie, completed.revision), 401);
    process.stdout.write("[owner-task-http] PASS new submission after cancel, saved-team provenance, two-image review, rejection reason, reopen, approval/replay/public match, terminal/revoked-session denial\n");
    const anonymous = await fetch(`${available.origin}/api/admin/matches/import`, {
      method: "POST", headers: { ...createHeaders, cookie: "", "idempotency-key": randomUUID() }, body: createBody,
    });
    assert.equal(anonymous.status, 401);
    await pool.query("UPDATE auth.sessions SET revoked_at=now() WHERE user_account_id=$1", [actorId]);
    const revoked = await fetch(`${available.origin}/api/admin/matches/import`, {
      method: "POST", headers: { ...createHeaders, "idempotency-key": randomUUID() }, body: createBody,
    });
    assert.equal(revoked.status, 401);
    process.stdout.write("[match-import-http] PASS password-only login, private import create/upload, anonymous/revoked denial (synthetic local storage/OCR)\n");
    const existing = await fetch(`${available.origin}/api/matches/${matchId}`);
    const existingText = await existing.text();
    assert.equal(existing.status, 200, existingText);
    const payload = JSON.parse(existingText) as { match?: { games?: Array<{ participants?: Array<{ kills: number; deaths: number; assists: number; championImageUrl: string | null; championKey: string }> }> } };
    const participants = payload.match?.games?.[0]?.participants ?? [];
    assert.equal(participants.length, 10);
    assert.deepEqual(participants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })), game.participants.map(({ kills, deaths, assists }) => ({ kills, deaths, assists })));
    const fallbackUrl = resolveChampionImageUrl(participants[0]?.championImageUrl, participants[0]?.championKey) ?? "";
    assert.equal(fallbackUrl, `https://ddragon.leagueoflegends.com/cdn/${DATA_DRAGON_VERSION}/img/champion/${DATA_DRAGON_CHAMPIONS[0]!.id}.png`);
    const missing = await fetch(`${available.origin}/api/matches/${randomUUID()}`);
    assert.equal(missing.status, 404);
    process.stdout.write(`[match-public-http] PASS publishedMatch expected=200 actual=${existing.status} participantCount=${participants.length} kdaPreserved=true dataDragonFallback=${fallbackUrl}\n`);
    process.stdout.write(`[match-public-http] PASS missingUuid expected=404 actual=${missing.status}\n`);
  } catch (error) {
    process.stderr.write(available.diagnostics().replaceAll(adminPassword, "[synthetic-password]").replaceAll(sessionKey, "[synthetic-signing-key]").replaceAll(totpKey, "[synthetic-encryption-key]").replaceAll(connectionString, "[disposable-database]") + "\n");
    throw error;
  } finally { await stopServer(available.child); }
} finally {
  await pool.end();
}
