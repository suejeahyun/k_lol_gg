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
const outputDirectory = resolve(".tmp/balance-policy-browser");
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
    tagLine: "QA", tagLineNormalized: "qa", memberName: `등록회원${String(index + 1).padStart(2, "0")}`, memberNameNormalized: `등록회원${String(index + 1).padStart(2, "0")}`,
    currentTier: index === 0 ? "EMERALD IV" : index < 4 ? "PLATINUM III" : "GOLD II", peakTier: index === 0 ? "DIAMOND IV" : "PLATINUM II",
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
  await activate(browser, "document.querySelector('[aria-labelledby=\"balance-step-two-title\"] details summary')");
  await activate(browser, "document.querySelector('[role=\"group\"][aria-label=\"추가 가능 포지션\"] button')");
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
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/u);
    return (await response.json() as { draft: TeamBalanceDraft }).draft;
  };
  const initial = await readDraft();
  const automatic = initial.candidates.find((candidate) => candidate.source === "AUTO" && candidate.rank === 1)!;
  assert.equal(initial.participants.length, 10);
  assert.ok(initial.participants.every(participant => /^등록회원\d{2}$/u.test(participant.registeredName ?? "")));
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-manual-slot] button').length"), 0);
  assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-card-drag-handle]')].every(node => /편성검증선수\\d{2}/u.test(node.innerText) && /등록회원\\d{2}/u.test(node.innerText))"), true);
  checks.push("authorized-draft-registered-names-and-no-store", "registered-name-next-to-nickname-no-click-swap-buttons");
  assert.ok(initial.participants.every((participant) => participant.eligiblePositions[0].position === "TOP"));
  assert.equal(initial.participants.filter(participant => participant.eligiblePositions.some(role => role.position === "JGL" && role.preference === "SUB")).length, 1);
  assert.equal(automatic.score.fairness?.constraintRelaxation?.roleDeviationCount, 7);
  assert.equal(automatic.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 0);
  assert.equal(automatic.score.v1?.formulaVersion, TEAM_BALANCE_V1_FORMULA_VERSION);
  assert.deepEqual(evaluateTeamBalanceLayout(initial.participants, automatic.assignments, { allowConstraintRelaxation: true }).score, automatic.score);
  checks.push("ui-search-select-ten-and-create", "relaxed-recommendation-original-positions-preserved", "automatic-and-domain-evaluation-identical");
  await writeFile(resolve(outputDirectory, "automatic.png"), await browser.captureScreenshot());

  const swap = automatic.assignments.flatMap((source, index) => {
    const targetIndex = index + 1;
    const target = automatic.assignments[targetIndex];
    if (!target || source.team !== target.team) return [];
    const layout = automatic.assignments.map((entry, slot) => ({ playerId: slot === index ? target.playerId : slot === targetIndex ? source.playerId : entry.playerId, team: entry.team, position: entry.position }));
    const preview = evaluateTeamBalanceLayout(initial.participants, layout, { allowConstraintRelaxation: true });
    if (preview.score.teamStrength.difference === automatic.score.teamStrength.difference || preview.score.v1?.recommendationScore === automatic.score.v1?.recommendationScore || preview.assignments.find(entry => entry.playerId === source.playerId)!.rating.effectiveScore === source.rating.effectiveScore) return [];
    return [{ source: index, target: targetIndex, preview }];
  })[0];
  assert.ok(swap, "synthetic fixture must change assigned score, team difference and balance score");
  const assertPreview = async (change = swap) => {
    await browser!.waitFor("document.querySelector('[aria-label=\"수동 변경 점수 미리보기\"]')", "preview after real input");
    const totals = await browser!.evaluate<string[]>("[...document.querySelector('[aria-label=\"현재 팀 평가\"]').querySelectorAll('strong')].map(node => node.textContent)");
    assert.deepEqual(totals.slice(1), [change.preview.score.teamStrength.redTotal.toFixed(1), change.preview.score.teamStrength.blueTotal.toFixed(1), change.preview.score.teamStrength.difference.toFixed(1)]);
    assert.equal(await browser!.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(`밸런스 점수 ${change.preview.score.v1!.recommendationScore}`)})`), true);
    for (const slot of [change.source, change.target]) {
      const original = automatic.assignments[slot];
      const expected = change.preview.assignments.find(entry => entry.team === original.team && entry.position === original.position)!;
      assert.equal(await browser!.evaluate<boolean>(`document.querySelector('[data-manual-slot="${slot}"]').innerText.includes(${JSON.stringify(`미리보기 점수 ${expected.rating.effectiveScore.toFixed(1)}`)})`), true);
    }
  };
  for (const input of ["mouse", "touch"] as const) {
    await browser.setViewport(input === "touch" ? 390 : 1440, 1000);
    if (input === "touch") {
      for (const slot of [0, 1]) {
        const selector = `[data-manual-slot="${slot}"] [data-card-drag-handle]`;
        await browser.drag(selector, selector, "touch");
      }
      assert.equal(await browser.evaluate("Boolean(document.querySelector('[aria-label=\"수동 변경 점수 미리보기\"]'))"), false);
      checks.push("two-touch-taps-do-not-swap-cards");
    }
    const beforeLabel = await browser.evaluate<string>(`document.querySelector('[data-manual-slot="${swap.target}"]').getAttribute('aria-label')`);
    await browser.drag(`[data-manual-slot="${swap.source}"] [data-card-drag-handle]`, `[data-manual-slot="${swap.target}"]`, input);
    await browser.waitFor(`document.querySelector('[data-manual-slot="${swap.source}"]').getAttribute('aria-label').includes(${JSON.stringify(beforeLabel.match(/편성검증선수\d{2}/u)![0])})`, `${input} drag actually swapped players`);
    assert.equal(await browser.evaluate<boolean>(`(${button("선택 팀 저장")}).disabled`), true);
    await assertPreview();
    await writeFile(resolve(outputDirectory, `preview-${input}.png`), await browser.captureScreenshot());
    await activate(browser, button("선택한 배치로 되돌리기"));
    await browser.waitFor("!document.querySelector('[aria-label=\"수동 변경 점수 미리보기\"]')", "reset after drag");
    checks.push(`${input === "touch" ? "390px-touch" : "desktop-native"}-drag-swap-and-preview`);
  }
  const crossSource = automatic.assignments.findIndex(entry => entry.team === "BLUE" && entry.position === "TOP");
  const crossTarget = automatic.assignments.findIndex(entry => entry.team === "RED" && entry.position === "JGL");
  const crossLayout = automatic.assignments.map((entry, index) => ({ playerId: index === crossSource ? automatic.assignments[crossTarget].playerId : index === crossTarget ? automatic.assignments[crossSource].playerId : entry.playerId, team: entry.team, position: entry.position }));
  const crossPreview = evaluateTeamBalanceLayout(initial.participants, crossLayout, { allowConstraintRelaxation: true });
  await browser.drag(`[data-manual-slot="${crossSource}"] [data-card-drag-handle]`, `[data-manual-slot="${crossTarget}"]`, "touch");
  await assertPreview({ source: crossSource, target: crossTarget, preview: crossPreview });
  checks.push("390px-cross-team-touch-edge-autoscroll-and-domain-preview");
  await browser.evaluate("document.querySelector('[data-manual-team-board]').scrollIntoView({block:'start',behavior:'instant'})");
  await writeFile(resolve(outputDirectory, "cross-team-touch.png"), await browser.captureScreenshot());
  await activate(browser, button("선택한 배치로 되돌리기"));
  await browser.setViewport(1440, 1000);
  await activate(browser, `document.querySelector('[data-manual-slot="${swap.source}"]')`);
  await activate(browser, `document.querySelector('[data-manual-slot="${swap.target}"]')`);
  await browser.waitFor("document.querySelector('[aria-label=" + JSON.stringify("수동 변경 점수 미리보기") + "]')", "manual score preview");
  assert.equal(await browser.evaluate<boolean>(`(${button("선택 팀 저장")}).disabled`), true);
  await assertPreview();
  checks.push("assigned-team-and-balance-preview-match-common-domain");
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
  await browser.evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__qaCopiedTeam = text; } } })");
  await activate(browser, button("팀 결과 복사"));
  const copied = await browser.evaluate<string>("window.__qaCopiedTeam");
  const registeredNames = new Map(manual.participants.map(participant => [participant.playerId, participant.registeredName]));
  const expectedCopy = (["BLUE", "RED"] as const).map(team => `${team} ${["TOP", "JGL", "MID", "ADC", "SUP"].map(position => registeredNames.get(selected.assignments.find(entry => entry.team === team && entry.position === position)!.playerId)).join(" ")}`).join("\n");
  assert.equal(copied, expectedCopy);
  assert.equal(copied.split("\n").length, 2);
  checks.push("copy-exactly-two-registered-name-lines-role-order");
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
    await browser.evaluate("document.querySelector('[data-manual-team-board]').scrollIntoView({block:'start',behavior:'instant'})");
    await writeFile(resolve(outputDirectory, `cards-${width}.png`), await browser.captureScreenshot());
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
    screenshots: ["automatic.png", "preview-mouse.png", "preview-touch.png", "cross-team-touch.png", "cards-1440.png", "cards-390.png", "cards-320.png", "saved-1440.png", "saved-390.png", "saved-320.png"],
  }, null, 2));
  process.stdout.write(`[balance-research-browser] PASS ${checks.length} checks; result: .tmp/balance-policy-browser/result.json\n`);
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
