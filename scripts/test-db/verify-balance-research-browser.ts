import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";

import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { TEAM_BALANCE_V1_FORMULA_VERSION, evaluateTeamBalanceLayout } from "../../src/modules/team-tools/domain/team-balance";
import type { TeamBalanceDraft } from "../../src/modules/team-tools/domain/team-balance-draft";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { players, teamBalanceDraftCandidates, teamBalanceDrafts, userAccounts } from "../../src/platform/db/schema";
import { IsolatedChromium } from "./isolated-chromium";
import { childTestEnvironment, startEphemeralCluster, stopAndRemoveCluster } from "./run-data-contracts";

// This command has no external origin or database input. Its only write target is
// the guarded disposable loopback PostgreSQL created by the existing DB runner.
const outputDirectory = resolve(".tmp/balance-research-browser");
const productionBuild = process.argv.includes("--production-build");
const checks: string[] = [];
const timings: Record<string, number> = {};

async function availablePort() {
  const server = createServer();
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  return address.port;
}

async function waitForServer(origin: string, child: ChildProcess) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local Next.js exited with ${child.exitCode}.`);
    try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch { /* Local server is starting. */ }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error("Local browser QA server did not become ready.");
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const stopped = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  await Promise.race([stopped, new Promise((done) => setTimeout(done, 5_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function activate(browser: IsolatedChromium, expression: string) {
  await browser.waitFor(`(() => { const target = ${expression}; return target instanceof HTMLElement && !target.matches(':disabled'); })()`, "enabled browser action", 45_000);
  await browser.evaluate(`(() => { document.querySelector('[data-balance-qa-action]')?.removeAttribute('data-balance-qa-action'); (${expression}).setAttribute('data-balance-qa-action', 'target'); })()`);
  await browser.focus('[data-balance-qa-action="target"]');
  await browser.pressEnter();
}

function button(label: string) {
  return `[...document.querySelectorAll('button')].find((node) => node.textContent.trim() === ${JSON.stringify(label)})`;
}

await mkdir(outputDirectory, { recursive: true });
const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined;
let browser: IsolatedChromium | undefined;
let serverLog = "";
const password = `${randomBytes(24).toString("base64url")}!Aa1`;
const sessionSecret = randomBytes(32).toString("base64url");
const rateLimitPepper = randomBytes(32).toString("base64url");
const privateValues = [password, sessionSecret, rateLimitPepper, cluster.connectionString];
try {
  await applyMigrations(database);
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const ownerLogin = `balance_owner_${randomBytes(4).toString("hex")}`;
  const otherLogin = `balance_other_${randomBytes(4).toString("hex")}`;
  const passwordHash = await hashPassword(password);
  await database.insert(userAccounts).values([
    { id: ownerId, loginId: ownerLogin, loginIdNormalized: ownerLogin, role: "USER", status: "APPROVED", passwordHash },
    { id: otherId, loginId: otherLogin, loginIdNormalized: otherLogin, role: "USER", status: "APPROVED", passwordHash },
  ]);
  await database.insert(players).values(Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(), nickname: `편성검증선수${String(index + 1).padStart(2, "0")}`,
    nicknameNormalized: `편성검증선수${String(index + 1).padStart(2, "0")}`,
    tagLine: "QA", tagLineNormalized: "qa", memberName: "합성회원", memberNameNormalized: "합성회원",
    currentTier: "GOLD II", peakTier: "GOLD II",
  })));
  const origin = `http://127.0.0.1:${await availablePort()}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", productionBuild ? "start" : "dev", "--hostname", "127.0.0.1", "--port", new URL(origin).port], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...childTestEnvironment(cluster.connectionString), NODE_ENV: productionBuild ? "production" : "development",
      V2_PUBLIC_DATA_SOURCE: "postgres", V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin,
      SESSION_SIGNING_KEYS: JSON.stringify({ current: "qa", keys: { qa: sessionSecret } }),
      V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper, V2_TEST_AUTH_ENABLED: "false", V2_TEST_AUTH_SECRET: "", V2_TEST_AUTH_FIXTURES_JSON: "",
    },
  });
  for (const stream of [app.stdout!, app.stderr!]) { stream.setEncoding("utf8"); stream.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-24_000); }); }
  await waitForServer(origin, app);
  const login = async (loginId: string) => {
    const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ loginId, password }) });
    assert.equal(response.status, 200, "ordinary synthetic account password login");
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie); privateValues.push(cookie); return cookie;
  };
  const cookie = await login(ownerLogin);
  const otherCookie = await login(otherLogin);
  checks.push("ordinary-owner-and-other-account-login");
  process.stdout.write("[balance-research-browser] isolated PostgreSQL, local server and ordinary login ready\n");
  browser = await IsolatedChromium.launch(origin);
  await browser.setViewport(1440, 1000);
  await browser.setCookie(cookie);
  await browser.navigate("/tools/team-balance");
  await browser.focus("#team-balance-player-search");
  await browser.insertText("편성검증선수");
  await browser.waitFor("document.querySelectorAll('form li button').length === 10", "synthetic player search results");
  for (let index = 0; index < 10; index += 1) {
    await activate(browser, `document.querySelectorAll('form li button')[${index}]`);
    await browser.waitFor(`document.querySelectorAll('[aria-label="선택한 참가자"] [data-filled="true"]').length === ${index + 1}`, "participant selected");
  }
  for (let index = 0; index < 10; index += 1) {
    await activate(browser, `document.querySelectorAll('[aria-labelledby="balance-step-two-title"] [role="group"][aria-label$=" 주 포지션"]')[${index}].querySelector('button')`);
  }
  const started = Date.now();
  const createdResponse = browser.waitForResponse("/api/team-tools/drafts", 201);
  await activate(browser, "document.querySelector('form button[type=" + JSON.stringify("submit") + "]')");
  await createdResponse;
  await browser.waitFor("location.pathname.includes('/tools/team-balance/drafts/') && document.querySelectorAll('[data-manual-slot]').length === 10", "created draft workspace", 60_000);
  timings.createMs = Date.now() - started;
  const draftId = await browser.evaluate<string>("location.pathname.split('/').at(-1)");
  const endpoint = `/api/team-tools/drafts/${draftId}`;
  const readDraft = async () => {
    const response = await fetch(`${origin}${endpoint}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    return (await response.json() as { draft: TeamBalanceDraft }).draft;
  };
  const initial = await readDraft();
  const automatic = initial.candidates.find((candidate) => candidate.source === "AUTO" && candidate.rank === 1)!;
  assert.equal(initial.participants.length, 10);
  assert.ok(initial.participants.every((participant) => participant.eligiblePositions.length === 1 && participant.eligiblePositions[0].position === "TOP"));
  assert.equal(automatic.score.fairness?.constraintRelaxation?.roleDeviationCount, 8);
  assert.equal(automatic.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 0);
  assert.equal(automatic.score.v1?.formulaVersion, TEAM_BALANCE_V1_FORMULA_VERSION);
  assert.deepEqual(evaluateTeamBalanceLayout(initial.participants, automatic.assignments, { allowConstraintRelaxation: true }).score, automatic.score);
  checks.push("ui-search-select-ten-and-create", "relaxed-recommendation-original-positions-preserved", "automatic-and-domain-evaluation-identical");
  await writeFile(resolve(outputDirectory, "automatic.png"), await browser.captureScreenshot());

  await activate(browser, "document.querySelector('[data-manual-slot=" + JSON.stringify("0") + "] button')");
  await activate(browser, "document.querySelector('[data-manual-slot=" + JSON.stringify("1") + "] button')");
  await browser.waitFor("document.querySelector('[aria-label=" + JSON.stringify("수동 변경 점수 미리보기") + "]')", "manual score preview");
  assert.equal(await browser.evaluate<boolean>(`(${button("선택 팀 저장")}).disabled`), true);
  const evaluatedResponse = browser.waitForResponse(`${endpoint}/select`, 200);
  await activate(browser, button("수동 배치 평가·선택"));
  await evaluatedResponse;
  await browser.waitFor("document.body.innerText.includes('수동 배치에 적용된 조정 조건')", "manual evaluation result");
  const manual = await readDraft();
  const selected = manual.candidates.find((candidate) => candidate.signature === manual.selectedCandidateSignature)!;
  assert.equal(selected.source, "MANUAL");
  assert.deepEqual(evaluateTeamBalanceLayout(manual.participants, selected.assignments, { allowConstraintRelaxation: true }).score, selected.score);
  assert.equal(await browser.evaluate("document.body.innerText.includes('조건을 조정해 가능한 최선의 팀을 만들었어요')"), false);
  assert.equal(await browser.evaluate("document.body.innerText.includes('예상 승률')"), false);
  checks.push("keyboard-swap-score-preview", "save-blocked-before-server-evaluation", "manual-and-domain-evaluation-identical", "manual-not-labelled-best-automatic", "no-predicted-win-rate");
  const savedResponse = browser.waitForResponse(`${endpoint}/save`, 200);
  await activate(browser, button("선택 팀 저장"));
  await savedResponse;
  await browser.waitFor("document.querySelector('section[data-status=" + JSON.stringify("SAVED") + "]')", "persisted saved state");
  const saved = await readDraft();
  assert.equal(saved.status, "SAVED");
  assert.equal((await database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)))[0].status, "SAVED");
  checks.push("ui-save-and-postgres-persistence");
  const oldScores = (await database.select({ score: teamBalanceDraftCandidates.scoreJson }).from(teamBalanceDraftCandidates)
    .where(and(eq(teamBalanceDraftCandidates.draftId, draftId), eq(teamBalanceDraftCandidates.evaluationRound, 1)))).map((row) => row.score);

  for (const width of [1440, 390, 320]) {
    await browser.setViewport(width, 900);
    await browser.waitFor(`innerWidth === ${width}`, "responsive viewport");
    assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `no ${width}px horizontal overflow`);
    await writeFile(resolve(outputDirectory, `saved-${width}.png`), await browser.captureScreenshot());
  }
  checks.push("desktop-mobile-narrow-no-overflow");
  await browser.setViewport(1440, 1000);
  const reevaluatedResponse = browser.waitForResponse(`${endpoint}/reevaluate`, 200);
  await activate(browser, button("최신 통계로 재평가"));
  await reevaluatedResponse;
  await browser.waitFor("document.body.innerText.includes('평가 2회')", "next evaluation round");
  const reevaluated = await readDraft();
  assert.equal(reevaluated.evaluationRound, 2);
  assert.equal(reevaluated.selectedCandidateSource, "AUTO");
  assert.deepEqual(reevaluated.participants.map((participant) => participant.eligiblePositions), initial.participants.map((participant) => participant.eligiblePositions));
  assert.deepEqual((await database.select({ score: teamBalanceDraftCandidates.scoreJson }).from(teamBalanceDraftCandidates)
    .where(and(eq(teamBalanceDraftCandidates.draftId, draftId), eq(teamBalanceDraftCandidates.evaluationRound, 1)))).map((row) => row.score), oldScores);
  checks.push("ui-reevaluation-and-append-only-old-scores");
  const request = (sessionCookie: string | undefined, revision: number, key: string, body: unknown = {}, requestOrigin = origin) => fetch(`${origin}${endpoint}/save`, {
    method: "POST", headers: { ...(sessionCookie ? { cookie: sessionCookie } : {}), origin: requestOrigin, "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": key }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${origin}${endpoint}`)).status, 401);
  assert.equal((await fetch(`${origin}${endpoint}`, { headers: { cookie: otherCookie } })).status, 404);
  assert.equal((await request(otherCookie, reevaluated.revision, randomUUID())).status, 404);
  assert.equal((await request(cookie, reevaluated.revision, randomUUID(), {}, "https://untrusted.invalid")).status, 403);
  assert.equal((await request(cookie, 0, randomUUID())).status, 412);
  const replayKey = randomUUID();
  assert.equal((await request(cookie, reevaluated.revision, replayKey)).status, 200);
  const replay = await request(cookie, reevaluated.revision, replayKey);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
  assert.equal((await request(cookie, reevaluated.revision + 1, replayKey)).status, 409);
  assert.equal((await readDraft()).revision, reevaluated.revision + 1);
  checks.push("anonymous-401-other-owner-404", "cross-origin-403", "stale-revision-412", "idempotent-replay-no-duplicate-write", "idempotency-mismatch-409");
  assert.deepEqual(browser.getRuntimeErrors(), []);
  await writeFile(resolve(outputDirectory, "result.json"), JSON.stringify({
    status: "PASS", checkedAt: new Date().toISOString(), formulaVersion: TEAM_BALANCE_V1_FORMULA_VERSION,
    runtime: productionBuild ? "next start" : "next dev", browser: "isolated headless Chromium", syntheticDataOnly: true,
    actualPostgres: true, actualHttpAndReact: true, productionWrites: 0, checks, timings,
    screenshots: ["automatic.png", "saved-1440.png", "saved-390.png", "saved-320.png"],
  }, null, 2));
  process.stdout.write(`[balance-research-browser] PASS ${checks.length} checks; result: .tmp/balance-research-browser/result.json\n`);
} catch (error) {
  if (browser) {
    await writeFile(resolve(outputDirectory, "failure.png"), await browser.captureScreenshot()).catch(() => undefined);
    await writeFile(resolve(outputDirectory, "browser-failure.json"), JSON.stringify({
      errors: browser.getRuntimeErrors(),
      page: await browser.evaluate("({ path: location.pathname, text: document.body.innerText.slice(-12000) })").catch(() => null),
    }, null, 2));
  }
  let safeLog = serverLog;
  for (const value of privateValues) safeLog = safeLog.replaceAll(value, "[synthetic-private]");
  await writeFile(resolve(outputDirectory, "server-failure.log"), safeLog);
  throw error;
} finally {
  if (browser) await browser.close();
  if (app) await stopServer(app);
  await pool.end();
  await stopAndRemoveCluster(cluster);
}
