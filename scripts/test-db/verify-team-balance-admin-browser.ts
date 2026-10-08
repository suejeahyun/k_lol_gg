import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { encryptTotpSecret } from "../../src/modules/auth/infrastructure/totp-envelope";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { adminTotpCredentials, players, teamBalancePlayerOverrides, userAccounts } from "../../src/platform/db/schema";
import { IsolatedChromium } from "./isolated-chromium";
import { childTestEnvironment, startEphemeralCluster, stopAndRemoveCluster } from "./run-data-contracts";

const outputDirectory = resolve(".tmp/team-balance-admin-browser");
const section = 'section[aria-labelledby="team-override-title"]';
const scoreSelector = `${section} input[name="score"]`;
const reasonSelector = `${section} input[name="reason"]`;
const submitSelector = `${section} button[type="submit"]`;
const endpoint = "/api/admin/balance-ai/team-overrides";
const previewRequested = process.argv.includes("--preview");

function base32(bytes: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...bytes].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  return bits.match(/.{1,5}/g)!.map((part) => alphabet[Number.parseInt(part.padEnd(5, "0"), 2)]).join("");
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  return address.port;
}

async function waitForServer(origin: string, child: ChildProcess) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited with ${child.exitCode}.`);
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      // The local development listener is still starting.
    }
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

async function replaceField(browser: IsolatedChromium, selector: string, value: string) {
  await browser.focus(selector);
  await browser.selectAll();
  await browser.insertText(value);
  await browser.waitFor(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`, "keyboard field update");
}

async function activateButton(browser: IsolatedChromium, text: string) {
  const selector = await browser.evaluate<string>(`(() => {
    const buttons = [...document.querySelectorAll(${JSON.stringify(`${section} button`)})];
    const button = buttons.find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (!button) throw new Error('Missing action: ' + ${JSON.stringify(text)});
    button.dataset.browserQaAction = 'target';
    return '[data-browser-qa-action="target"]';
  })()`);
  await browser.focus(selector);
  await browser.pressEnter();
  await browser.evaluate("document.querySelector('[data-browser-qa-action]')?.removeAttribute('data-browser-qa-action')");
}

await mkdir(outputDirectory, { recursive: true });
const cluster = await startEphemeralCluster();
const { database, pool } = createDatabaseHandle(cluster.connectionString);
let app: ChildProcess | undefined;
let browser: IsolatedChromium | undefined;
let serverLog = "";
const password = `${randomBytes(24).toString("base64url")}!Aa1`;
const totpSecret = base32(randomBytes(20));
const sessionSecret = randomBytes(32).toString("base64url");
const totpKey = randomBytes(32).toString("base64url");
const rateLimitPepper = randomBytes(32).toString("base64url");
const privateValues = [password, totpSecret, sessionSecret, totpKey, rateLimitPepper, cluster.connectionString];
try {
  await applyMigrations(database);
  process.stdout.write("[team-balance-browser] isolated database migrated\n");
  const adminId = randomUUID();
  const playerId = randomUUID();
  const loginId = `balance_browser_${randomBytes(4).toString("hex")}`;
  const nickname = "내전점수검증플레이어";
  const totpKeysJson = JSON.stringify({ current: 1, keys: { 1: totpKey } });
  await database.insert(userAccounts).values({
    id: adminId, loginId, loginIdNormalized: loginId, role: "ADMIN", status: "APPROVED",
    passwordHash: await hashPassword(password),
  });
  await database.insert(adminTotpCredentials).values({
    userAccountId: adminId,
    ...encryptTotpSecret(adminId, totpSecret, parseTotpEncryptionKeyring(totpKeysJson)),
    enabledAt: new Date(),
  });
  await database.insert(players).values({
    id: playerId, nickname, nicknameNormalized: nickname, tagLine: "QA", tagLineNormalized: "qa",
    memberName: "합성검증회원", memberNameNormalized: "합성검증회원", currentTier: "GOLD II", peakTier: "PLATINUM I",
  });
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...childTestEnvironment(cluster.connectionString), NODE_ENV: "development",
      V2_PUBLIC_DATA_SOURCE: "postgres", V2_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin,
      SESSION_SIGNING_KEYS: JSON.stringify({ current: "qa", keys: { qa: sessionSecret } }),
      TOTP_ENCRYPTION_KEYS: totpKeysJson, V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
      V2_TEST_AUTH_ENABLED: "false", V2_TEST_AUTH_SECRET: "", V2_TEST_AUTH_FIXTURES_JSON: "",
    },
  });
  for (const stream of [app.stdout!, app.stderr!]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { serverLog = `${serverLog}${chunk}`.slice(-16_000); });
  }
  await waitForServer(origin, app);
  process.stdout.write("[team-balance-browser] local development server ready\n");
  const login = await fetch(`${origin}/api/admin/login`, {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ loginId, password, totpCode: generateTotpCode(totpSecret, Math.floor(Date.now() / 30_000)) }),
  });
  assert.equal(login.status, 200, "synthetic ADMIN must log in through the ordinary password and TOTP endpoint");
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  process.stdout.write("[team-balance-browser] ordinary ADMIN login passed\n");
  privateValues.push(cookie);
  const readCurrent = async () => {
    const response = await fetch(`${origin}${endpoint}?playerId=${playerId}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    return await response.json() as { score: number; revision: number; reason: string };
  };
  const concurrentSave = async (revision: number, score: number) => {
    const response = await fetch(`${origin}${endpoint}`, {
      method: "POST",
      headers: { cookie, origin, "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": `balance-browser-${randomUUID()}` },
      body: JSON.stringify({ playerId, score, reason: "동시 변경 충돌 검증" }),
    });
    assert.equal(response.status, 200, "second ADMIN request must save a concurrent revision");
  };
  browser = await IsolatedChromium.launch(origin);
  await browser.setViewport(1440, 1000);
  await browser.setCookie(cookie);
  await browser.navigate("/admin/balance-ai");
  await browser.waitFor(`document.querySelector(${JSON.stringify(section)})`, "ADMIN override control");
  assert.equal(await browser.evaluate("document.hasFocus()"), true, "keyboard QA target must own browser focus");

  const selectPlayer = async () => {
    assert.ok(browser);
    await browser.waitFor(`(() => {
      const input = document.querySelector(${JSON.stringify(`${section} input[role="combobox"]`)});
      if (!input) return false;
      if (input.getAttribute('aria-expanded') === 'true') return true;
      if (document.activeElement !== input) input.focus();
      return false;
    })()`, "hydrated player picker");
    await replaceField(browser, `${section} input[role="combobox"]`, nickname);
    await browser.waitFor(`document.querySelector(${JSON.stringify(`${section} [role="option"]`)})?.textContent.includes(${JSON.stringify(nickname)})`, "remote player search result");
    await browser.pressEnter();
    await browser.waitFor(`(() => {
      const input = document.querySelector(${JSON.stringify(scoreSelector)});
      return input && !input.matches(':disabled') && input.value !== '';
    })()`, "automatic current score load after player selection");
  };
  const submit = async (status: number) => {
    assert.ok(browser);
    const response = browser.waitForResponse(endpoint, status);
    await browser.focus(submitSelector);
    await browser.pressEnter();
    await response;
    await browser.waitFor(`document.querySelector(${JSON.stringify(`${section} [role="status"]`)})?.textContent.includes('저장')`, "save completion");
  };
  await selectPlayer();
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(scoreSelector)}).value`), "0");
  await replaceField(browser, scoreSelector, "25");
  await replaceField(browser, reasonSelector, "합성 내전 점수 추가 검증");
  await submit(200);
  assert.equal((await readCurrent()).score, 25);
  assert.equal((await database.select().from(teamBalancePlayerOverrides).where(eq(teamBalancePlayerOverrides.playerId, playerId)))[0]?.score, 25);
  process.stdout.write("[team-balance-browser] ADMIN keyboard search and +25 save passed\n");

  const viewports: { width: number; height: number; file: string }[] = [
    { width: 1440, height: 1000, file: "desktop.png" },
    { width: 390, height: 844, file: "mobile.png" },
    { width: 320, height: 800, file: "narrow.png" },
  ];
  for (const viewport of viewports) {
    await browser.setViewport(viewport.width, viewport.height);
    await browser.evaluate(`document.querySelector(${JSON.stringify(section)}).scrollIntoView({ block: 'start' })`);
    await browser.waitFor(`innerWidth === ${viewport.width}`, "responsive viewport");
    assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `page must fit ${viewport.width}px viewport`);
    assert.equal(await browser.evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(`${section} input, ${section} textarea, ${section} button`)})].every((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width === 0 || rect.left >= -1 && rect.right <= innerWidth + 1;
    }))()`), true, `override controls must fit ${viewport.width}px viewport`);
    await writeFile(resolve(outputDirectory, viewport.file), await browser.captureScreenshot());
  }
  await browser.setViewport(1440, 1000);
  await browser.navigate("/admin/balance-ai");
  await selectPlayer();
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(scoreSelector)}).value`), "25", "reloading must retain saved score");

  await concurrentSave((await readCurrent()).revision, 40);
  await replaceField(browser, scoreSelector, "50");
  await replaceField(browser, reasonSelector, "충돌 후 재확인 검증");
  const conflictResponse = browser.waitForResponse(endpoint, 412);
  await browser.focus(submitSelector);
  await browser.pressEnter();
  await conflictResponse;
  await browser.waitFor(`document.querySelector(${JSON.stringify(section)})?.textContent.includes('다른')`, "concurrent modification alert");
  assert.equal((await readCurrent()).score, 40, "stale browser edit must not overwrite concurrent score");
  await browser.setOffline(true);
  await activateButton(browser, "최신 점수 확인");
  await browser.waitFor(`document.querySelector(${JSON.stringify(`${section} [role="alert"]`)}) && [...document.querySelectorAll(${JSON.stringify(`${section} button`)})].some((button) => button.textContent.includes('다시 불러오기') && !button.disabled)`, "offline conflict reload recovery");
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(scoreSelector)}).value`), "50", "failed conflict refresh must retain unsaved score");
  await browser.setOffline(false);
  await activateButton(browser, "다시 불러오기");
  await browser.waitFor(`document.querySelector(${JSON.stringify(submitSelector)})?.disabled === false`, "conflict recovery fetch");
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(scoreSelector)}).value`), "50", "conflict recovery must preserve unsaved score");

  await replaceField(browser, scoreSelector, "60");
  await replaceField(browser, reasonSelector, "연결 복구 재시도 검증");
  await browser.setOffline(true);
  await browser.focus(submitSelector);
  await browser.pressEnter();
  await browser.waitFor(`document.querySelector(${JSON.stringify(`${section} [role="alert"]`)}) && [...document.querySelectorAll(${JSON.stringify(`${section} button`)})].some((button) => button.textContent.includes('저장 결과 다시 확인') && !button.disabled)`, "offline error with retained form");
  await browser.setOffline(false);
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(scoreSelector)}).value`), "60", "network error must preserve draft score");
  const retryResponse = browser.waitForResponse(endpoint, 200);
  await activateButton(browser, "저장 결과 다시 확인");
  await retryResponse;
  await browser.waitFor(`document.querySelector(${JSON.stringify(`${section} [role="status"]`)})?.textContent.includes('저장')`, "network retry completion");
  assert.equal((await readCurrent()).score, 60);

  await activateButton(browser, "0점으로 초기화");
  await browser.waitFor(`document.querySelector(${JSON.stringify(scoreSelector)})?.value === '0'`, "clear action sets zero");
  await replaceField(browser, reasonSelector, "합성 내전 점수 해제 검증");
  await submit(200);
  assert.equal((await readCurrent()).score, 0);
  await writeFile(resolve(outputDirectory, "result.json"), JSON.stringify({
    passed: true, actorRole: "ADMIN", syntheticDataOnly: true,
    checks: ["ordinary-admin-login", "keyboard-search-auto-load", "save-plus-25", "db-persisted", "reload", "desktop-mobile-narrow-overflow", "concurrent-412-reload", "offline-conflict-reload-preserved-draft", "offline-preserved-draft-retry", "clear-zero"],
    screenshots: viewports.map(({ file }) => file),
  }, null, 2));
  process.stdout.write(`[team-balance-browser] ADMIN search/save/reload/conflict/offline retry/clear passed; screenshots: ${outputDirectory}\n`);
  if (previewRequested) {
    await browser.close();
    browser = undefined;
    const previewPath = resolve(outputDirectory, "preview.json");
    const stopPath = resolve(outputDirectory, `preview-stop-${process.pid}`);
    const expiresAt = Date.now() + 2 * 60 * 60_000;
    await writeFile(previewPath, JSON.stringify({
      url: `${origin}/admin/balance-ai`, loginId, password, playerSearch: nickname,
      expiresAt: new Date(expiresAt).toISOString(), stopFile: stopPath, syntheticDataOnly: true,
    }, null, 2), { mode: 0o600 });
    process.stdout.write(`[team-balance-browser] temporary preview ready: ${origin}/admin/balance-ai\n`);
    try {
      while (Date.now() < expiresAt && app.exitCode === null) {
        try { await access(stopPath); break; } catch { /* Keep the isolated preview available. */ }
        await new Promise((done) => setTimeout(done, 1_000));
      }
    } finally {
      await unlink(previewPath).catch(() => undefined);
      await unlink(stopPath).catch(() => undefined);
    }
  }
} catch (error) {
  if (browser) {
    await browser.setOffline(false).catch(() => undefined);
    await writeFile(resolve(outputDirectory, "failure.png"), await browser.captureScreenshot()).catch(() => undefined);
    await writeFile(resolve(outputDirectory, "browser-failure.json"), JSON.stringify({
      errors: browser.getRuntimeErrors(),
      page: await browser.evaluate(`({ location: location.pathname, ready: document.readyState, active: document.activeElement?.outerHTML, picker: document.querySelector(${JSON.stringify(`${section} input[role="combobox"]`)})?.outerHTML, scripts: [...document.scripts].filter((node) => node.src).map((node) => node.src) })`).catch(() => null),
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
