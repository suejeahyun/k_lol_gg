/** UI QA against the guarded synthetic loopback HUB only. Never operates the user's browser. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "docs/qa-evidence/community-site-studio-2026-10-29/browser");
const checks = []; const snapshots = []; const exceptions = []; const blockedOrigins = new Set();
let step = "guarded loopback initialization"; let chrome; let socket; let profile; let pool; let successful = false; let failureState = null; let captureFailure;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
function check(value, description) { checks.push({ check: description, passed: Boolean(value) }); assert.ok(value, description); }
async function reservePort() { const server = createServer(); await new Promise((done) => server.listen(0, "127.0.0.1", done)); const port = server.address().port; await new Promise((done) => server.close(done)); return port; }

try {
  const state = JSON.parse(await readFile(resolve(root, ".private/hub-preview-state.json"), "utf8"));
  assert.equal(state.localOnly, true); assert.equal(state.active, true);
  assert.match(state.database, /^klol_v2_test_hub_preview_[a-f0-9]{16}$/u);
  const base = new URL(state.origin); const bridge = new URL(state.loginUrl);
  for (const url of [base, bridge]) { assert.equal(url.protocol, "http:"); assert.equal(url.hostname, "127.0.0.1"); assert.ok(url.port && !url.username && !url.password); }
  assert.equal(base.pathname, "/"); assert.ok(!base.search && !base.hash);
  const local = JSON.parse(await readFile(resolve(root, ".private/nexus-local-database.json"), "utf8"));
  const target = new URL(local.connectionString); assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "55439"); assert.equal(target.pathname, "/nexus_gg_local");
  target.pathname = `/${state.database}`; assertSafeTestDatabase({ connectionString: target.toString(), nodeEnv: "test", testMode: "true" });
  pool = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 5000 });
  assert.equal((await pool.query("select current_database() as name")).rows[0].name, state.database);
  const readiness = await fetch(`${base.origin}/api/admin/community-sites`, { headers: { Cookie: `gg_hub_session=${state.adminToken}` }, signal: AbortSignal.timeout(15_000) });
  assert.equal(readiness.status, 200); assert.equal((await readiness.json()).provisioningReady, false, "UI QA cannot enqueue external provisioning");
  await mkdir(output, { recursive: true });
  const debugPort = await reservePort(); profile = await mkdtemp(join(resolve(tmpdir()), "gg-hub-studio-browser-"));
  chrome = spawn(process.env.V2_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) { try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === "page"); if (page) break; } catch { /* Chrome is starting. */ } await pause(100); }
  assert.ok(page); socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const pending = new Map(); let nextId = 0; const events = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(new Error(`CDP ${request.method} failed`)); else request.done(message.result); }
    else { if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text); events.get(message.method)?.(message.params); }
  });
  const call = (method, params = {}) => new Promise((done, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 30_000); pending.set(id, { done, reject, timer, method }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (response.exceptionDetails) throw new Error("Browser expression failed"); return response.result.value; };
  captureFailure = () => evaluate("({path:location.pathname,headings:[...document.querySelectorAll('h1')].map(e=>e.textContent),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),buttons:[...document.querySelectorAll('button')].map(e=>({label:e.textContent.trim(),disabled:e.disabled}))})");
  const until = async (expression) => { for (let attempt = 0; attempt < 150; attempt += 1) { try { if (await evaluate(expression)) return; } catch { /* Navigation temporarily replaces context. */ } await pause(100); } throw new Error(`UI condition timeout during ${step}`); };
  const click = (label) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b || b.disabled) throw Error('Unavailable button'); b.click(); })()`);
  const setValue = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!input) throw Error('Missing field'); const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  const navigate = async (path, condition) => { const url = new URL(path, base); assert.equal(url.origin, base.origin); await call("Page.navigate", { url: url.href }); await until(condition); await pause(400); };
  const viewport = async (width, height) => { await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 }); await pause(150); };
  const readSites = () => evaluate("fetch('/api/community-sites',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Read failed');return(await r.json()).sites})");
  events.set("Fetch.requestPaused", async (event) => { const url = new URL(event.request.url); if ([base.origin, bridge.origin].includes(url.origin) || ["data:", "blob:"].includes(url.protocol)) await call("Fetch.continueRequest", { requestId: event.requestId }); else { blockedOrigins.add(url.origin); await call("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }); } });
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable"); await call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const axeSource = await readFile(resolve(root, "node_modules/axe-core/axe.min.js"), "utf8");
  async function snapshot(name) {
    await evaluate("document.fonts.ready"); await pause(150); await evaluate(axeSource);
    const metrics = await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,mainCount:document.querySelectorAll('main').length,h1Count:document.querySelectorAll('h1').length,lang:document.documentElement.lang,previews:[...document.querySelectorAll('strong')].filter(e=>e.textContent==='홈 미리보기').length})");
    const violations = await evaluate("axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})))");
    await evaluate("scrollTo(0,0)");
    const layout = await call("Page.getLayoutMetrics"); const size = layout.cssContentSize;
    const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
    await writeFile(join(output, `${name}.png`), Buffer.from(screenshot.data, "base64"));
    const result = { name, ...metrics, violations, screenshot: `${name}.png` }; snapshots.push(result);
    // Keep all visual evidence even when a page needs a UI correction.
    checks.push({ check: `${name}: no horizontal overflow`, passed: metrics.scrollWidth <= metrics.clientWidth });
    checks.push({ check: `${name}: document landmarks and language`, passed: metrics.mainCount === 1 && metrics.h1Count >= 1 && metrics.lang === "ko" });
    checks.push({ check: `${name}: WCAG A/AA axe checks`, passed: violations.length === 0 });
  }

  step = "signup and login through the browser";
  await viewport(320, 800); await navigate("/signup?next=%2Fsites%2Fnew", "!!document.querySelector('input[name=loginId]')");
  await snapshot("01-signup-320");
  check(await evaluate("!document.querySelector('input[name=riotId]') && !document.querySelector('input[name=memberName]')"), "hub signup needs no game identity");
  const run = randomBytes(5).toString("hex"); const loginId = `studio-ui-${run}`; const password = `Synthetic-Ui-${randomBytes(16).toString("hex")}!9`;
  await setValue('input[name="loginId"]', loginId); await setValue('input[name="password"]', password);
  await evaluate("document.querySelector('input[name=termsAccepted]').click();document.querySelector('input[name=privacyAccepted]').click()");
  await click("가입하기"); await until("document.body.innerText.includes('로그인하고 계속하기')"); check(true, "ordinary signup completes from the UI");
  await navigate("/login?next=%2Fsites%2Fnew", "!!document.querySelector('input[name=loginId]')");
  await setValue('input[name="loginId"]', loginId); await setValue('input[name="password"]', password); await click("로그인");
  await until("location.pathname==='/sites/new' && !!document.querySelector('input[id$=\"-name\"]')");
  const accountCookie = (await call("Network.getCookies", { urls: [base.origin] })).cookies.find((cookie) => cookie.name === "gg_hub_account_session");
  check(Boolean(accountCookie?.httpOnly), "browser login creates a purpose-bound HttpOnly account session");

  step = "three themes and responsive editor";
  await viewport(1440, 1000); const name = `브라우저 검증 커뮤니티 ${run}`; const slug = `ui-studio-${run}`;
  await setValue('input[id$="-name"]', name); await setValue('input[id$="-slug"]', slug); await setValue('input[id$="-description"]', "로컬 시험 자료로 테마와 기능을 검증합니다."); await setValue('input[id$="-color"]', "#8B5CF6");
  for (const theme of ["arena", "lounge", "club"]) {
    await evaluate(`document.querySelector('input[type=radio][value=${theme}]').click()`);
    await until(`document.querySelector('input[type=radio][value=${theme}]').checked`);
    check(await evaluate(`document.querySelector('input[id$="-name"]').value===${JSON.stringify(name)} && document.querySelector('input[id$="-color"]').value==='#8B5CF6'`), `${theme} template preserves custom identity and color`);
    await snapshot(`02-theme-${theme}-1440`);
  }
  await viewport(390, 844); await snapshot("03-editor-390"); await viewport(320, 800); await snapshot("04-editor-320");
  await evaluate("document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute('tabindex')");
  for (let tab = 0; tab < 8; tab += 1) {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    check(await evaluate("(() => {const e=document.activeElement,r=e.getBoundingClientRect(),s=getComputedStyle(e);return e!==document.body && r.width>0 && r.height>0 && s.visibility==='visible' && s.display!=='none' && (parseFloat(s.outlineWidth)>0 || s.boxShadow!=='none');})()"), `narrow editor keyboard focus ${tab + 1} is visible`);
  }

  step = "module dependency confirmation and section order";
  const moduleControl = (label) => `[...document.querySelectorAll('label')].find(l=>l.querySelector('strong')?.textContent===${JSON.stringify(label)}).querySelector('input[type=checkbox]')`;
  await evaluate(`if (!${moduleControl("팀 밸런스")}.checked) ${moduleControl("팀 밸런스")}.click()`);
  await evaluate(`if (!${moduleControl("랭킹")}.checked) ${moduleControl("랭킹")}.click()`);
  await evaluate(`${moduleControl("경기 기록")}.click()`);
  await until("!!document.querySelector('[role=group][aria-label=\"경기 기록 끄기 영향 확인\"]')");
  check(await evaluate(`${moduleControl("경기 기록")}.checked`), "disabling a module waits for impact confirmation");
  await click("켜 둔 상태 유지"); check(await evaluate(`${moduleControl("경기 기록")}.checked`), "canceling the warning preserves enabled modules");
  await evaluate(`${moduleControl("경기 기록")}.click()`); await click("확인하고 기능 끄기");
  check(await evaluate(`!${moduleControl("경기 기록")}.checked && !${moduleControl("팀 밸런스")}.checked && !${moduleControl("랭킹")}.checked`), "confirmed match disable also disables dependent balance and rankings");
  await evaluate(`${moduleControl("팀 밸런스")}.click()`);
  check(await evaluate(`${moduleControl("경기 기록")}.checked && ${moduleControl("팀 밸런스")}.checked`), "enabling balance restores its required match module");
  const orderExpression = "[...document.querySelectorAll('fieldset')].find(e=>e.querySelector('legend')?.textContent==='홈 블록 선택과 순서')";
  const beforeOrder = await evaluate(`[...${orderExpression}.querySelectorAll('button[aria-label$="위로 이동"]')].map(b=>b.getAttribute('aria-label'))`);
  await evaluate(`[...${orderExpression}.querySelectorAll('button[aria-label$="위로 이동"]')].find(b=>!b.disabled).click()`);
  const afterOrder = await evaluate(`[...${orderExpression}.querySelectorAll('button[aria-label$="위로 이동"]')].map(b=>b.getAttribute('aria-label'))`);
  check(beforeOrder[0] === afterOrder[1] && beforeOrder[1] === afterOrder[0], "home sections can move above the introduction without losing it");
  await snapshot("05-module-confirmation-result-320");

  step = "site submission and owner editing";
  await click("개설 신청하기"); await until("document.body.innerText.includes('요청을 저장했습니다.')");
  let site = (await readSites()).find((entry) => entry.configuration.slug === slug);
  check(site?.status === "SUBMITTED" && site.configuration.templateId === "club", "configured template is submitted for review");
  check(site.configuration.modules.matches && site.configuration.modules.teamBalance && !site.configuration.modules.rankings, "module choices persist in the submitted application");
  check(site.configuration.homeSections[1] === "introduction", "custom home order persists in the application");
  await navigate("/sites", "document.body.innerText.includes('내가 운영하는 사이트') && !!document.querySelector('[aria-label=\"내 사이트 목록\"] article')"); await snapshot("06-owner-list-320");
  await navigate(`/sites/${site.id}`, "!!document.querySelector('input[id$=\"-name\"]') && document.body.innerText.includes('심사 대기')");
  await setValue('input[id$="-description"]', "화면에서 저장한 보완 전 초안"); await click("초안 저장"); await until("document.body.innerText.includes('초안을 저장했습니다.')");
  site = (await readSites()).find((entry) => entry.id === site.id); check(site.configuration.description === "화면에서 저장한 보완 전 초안", "owner editing persists a draft through the UI");

  step = "administrator review without provisioning";
  await call("Page.navigate", { url: bridge.href }); await until(`location.origin===${JSON.stringify(base.origin)}`);
  await viewport(1440, 1000); await navigate("/admin/community-sites", "!!document.querySelector('[aria-label=\"심사할 사이트\"] button')");
  await evaluate(`([...document.querySelectorAll('[aria-label="심사할 사이트"] button')].find(b=>b.querySelector('strong')?.textContent===${JSON.stringify(name)})).click()`);
  await until("!!document.querySelector('#review-reason')");
  check(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='개설 승인')?.disabled"), "approval is disabled while provider setup is unavailable");
  check(await evaluate("document.querySelector('input[id$=\"-name\"]').closest('fieldset').disabled"), "reviewer sees the submitted configuration without editing ownership fields");
  await snapshot("07-admin-review-1440"); await viewport(320, 800); await snapshot("08-admin-review-320");
  await setValue("#review-reason", "소개 내용을 보완해 주세요. 로컬 UI 검증용 안내입니다."); await click("보완 요청");
  await until("document.body.innerText.includes('신청자의 보완과 재제출을 기다리고 있습니다.')"); check(true, "reviewer can request changes through the UI");

  step = "owner resubmission after review feedback";
  await call("Network.deleteCookies", { name: "gg_hub_session", url: base.origin });
  await call("Network.setCookie", { name: accountCookie.name, value: accountCookie.value, url: base.origin, httpOnly: true, sameSite: "Strict" });
  await navigate(`/sites/${site.id}`, "!!document.querySelector('input[id$=\"-name\"]') && document.body.innerText.includes('보완 요청')");
  check(await evaluate("document.body.innerText.includes('소개 내용을 보완해 주세요.')"), "owner can read the review explanation");
  await setValue('input[id$="-description"]', "운영 취지와 참여 규칙을 보완한 로컬 시험 커뮤니티입니다."); await click("초안 저장"); await until("document.body.innerText.includes('초안을 저장했습니다.')"); await click("다시 심사 요청");
  await until("document.body.innerText.includes('심사 대기') && document.body.innerText.includes('요청을 저장했습니다.')");
  site = (await readSites()).find((entry) => entry.id === site.id); check(site.status === "SUBMITTED" && site.reviewReason === null, "resubmission clears old review feedback and returns to the queue");
  await snapshot("09-owner-resubmitted-320");
  check(exceptions.length === 0, "interactive flows produce no uncaught browser exceptions");
  check(blockedOrigins.size === 0, "all page requests stay on the guarded loopback app");
  successful = checks.every((item) => item.passed);
  await call("Browser.close");
} catch (error) {
  failureState = await captureFailure?.().catch(() => null) ?? null;
  checks.push({ check: step, passed: false, error: error instanceof assert.AssertionError ? "Assertion failed" : "Browser check did not complete" });
  process.exitCode = 1;
} finally {
  socket?.close(); if (chrome && chrome.exitCode === null) chrome.kill(); await pool?.end();
  if (profile) { const resolved = resolve(profile); const parent = resolve(tmpdir()); assert.ok(resolved.startsWith(`${parent}${sep}`) && resolved.split(sep).at(-1).startsWith("gg-hub-studio-browser-")); await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}); }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "report.json"), `${JSON.stringify({ recordedAt: new Date().toISOString(), localOnly: true, syntheticDataOnly: true, successful, checks, snapshots, failureState, exceptionCount: exceptions.length, blockedExternalOriginCount: blockedOrigins.size }, null, 2)}\n`);
  if (!successful) process.exitCode = 1;
  console.log(JSON.stringify({ successful, checks: checks.length, passed: checks.filter((item) => item.passed).length, snapshots: snapshots.length, evidence: "docs/qa-evidence/community-site-studio-2026-10-29/browser/report.json", stoppedAt: successful ? null : step }));
}
