import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

async function port() {
  const listener = createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const number = listener.address().port;
  await new Promise((done) => listener.close(done));
  return number;
}

export async function runDestructionBrowserInteractions({ origin, tournamentId, mayhemId, accountToken, recruitingIds, classicRecruitingId, adminToken, output, root }) {
  const debugPort = await port();
  const parent = resolve(tmpdir());
  const profile = await mkdtemp(join(parent, "klol-destruction-browser-"));
  const chrome = spawn(process.env.V2_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  const pending = new Map();
  const events = new Map();
  let nextId = 0;
  const report = [];
  const exceptions = [];
  try {
    let target;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === "page"); if (target) break; } catch { /* startup */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(target);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) { const request = pending.get(message.id); if (!request) return; clearTimeout(request.timer); pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.done(message.result); }
      else { if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text); events.get(message.method)?.(message.params); }
    });
    const call = (method, params = {}) => new Promise((done, reject) => {
      const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { done, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => { const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.text); return response.result.value; };
    const until = async (expression) => { for (let i = 0; i < 70; i += 1) { if (await evaluate(expression)) return; await new Promise((done) => setTimeout(done, 150)); } await writeFile(join(output, "interaction-failure.json"), JSON.stringify(await evaluate("({url: location.href, history: history.length, text: document.body.innerText, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, sounds: window.__auctionSounds, phase: document.querySelector('[data-auction-phase]')?.dataset.auctionPhase})"), null, 2)); throw new Error(`UI did not become ready: ${expression}`); };
    const click = (label) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!button || button.disabled) throw Error('button unavailable'); button.click(); })()`);
    const current = async () => { const response = await fetch(`${origin}/api/admin/competitions/destruction/${tournamentId}`, { headers: { Cookie: `klol_v2_session=${adminToken}` } }); assert.equal(response.status, 200); return (await response.json()).destruction; };
    await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await call("Network.setCookie", { name: "klol_v2_session", value: adminToken, url: origin, httpOnly: true, sameSite: "Strict" });
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call("Page.navigate", { url: `${origin}/admin/progress/destruction/${tournamentId}` });
    await until("document.body.innerText.includes('연결됨') && [...document.querySelectorAll('button')].some(b => b.textContent === '경매 일시 중단')");
    await until("document.querySelector('[data-auction-phase]')?.dataset.auctionPhase === 'revealed'");
    await evaluate("window.__auctionSounds = []; const originalStart = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function(...args) { window.__auctionSounds.push(this.buffer?.duration ?? 0); return originalStart.apply(this,args); };");
    await click("효과음 켜기");
    await until("window.__auctionSounds.length >= 1");
    const before = await current();
    await evaluate("(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === '경매 일시 중단'); button.click(); button.click(); })()");
    await until("[...document.querySelectorAll('button')].some(b => b.textContent === '경매 재개' && !b.disabled)");
    const paused = await current(); assert.equal(paused.auctionPaused, true); assert.equal(paused.revision, before.revision + 1);
    report.push("빠른 중복 클릭: 경매 중단을 한 번만 반영");

    // Drop a successful PATCH response after the server has committed it.
    let lostResponse = false;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.request.method === "PATCH" && !lostResponse) { lostResponse = true; await call("Fetch.failRequest", { requestId: event.requestId, errorReason: "ConnectionClosed" }); }
      else await call("Fetch.continueResponse", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: `${origin}/api/admin/competitions/destruction/${tournamentId}`, requestStage: "Response" }] });
    await click("경매 재개");
    await until("document.body.innerText.includes('요청 결과 다시 확인')");
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    const committed = await current(); assert.equal(committed.auctionPaused, false); assert.equal(committed.revision, paused.revision + 1);
    await click("요청 결과 다시 확인");
    await until("[...document.querySelectorAll('button')].some(b => b.textContent === '경매 일시 중단' && !b.disabled)");
    assert.equal((await current()).revision, committed.revision);
    report.push("서버 저장 후 응답 유실: 같은 멱등성 키로 재확인, 중복 변경 없음");

    await evaluate("(() => { const input = document.querySelector('input[name=purchasePoints]'); input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await click("낙찰 확정");
    await until("!document.querySelector('input[name=purchasePoints]') && [...document.querySelectorAll('button')].some(b => b.textContent === '다음 선수 추첨' && !b.disabled)");
    const sold = await current(); const original = before.participants.find((entry) => entry.auctionStatus === "DRAWN");
    assert.equal(sold.participants.find((entry) => entry.id === original.id).auctionStatus, "SOLD");
    assert.equal(sold.teams.reduce((sum, team) => sum + team.remainingAuctionPoints, 0), before.teams.reduce((sum, team) => sum + team.remainingAuctionPoints, 0) - 1);
    report.push("모바일 낙찰 폼: 선수 배정과 포인트 차감 확인");

    await click("다음 선수 추첨");
    await until("document.querySelector('[data-auction-phase]')?.dataset.auctionPhase === 'shuffle'");
    await evaluate("document.querySelector('[data-auction-phase]').scrollIntoView({block:'center'})");
    const cardBack = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(output, "auction-card-back.png"), Buffer.from(cardBack.data, "base64"));
    await until("document.querySelector('[data-auction-phase]')?.dataset.auctionPhase === 'revealed'");
    await until(`document.querySelector('[data-auction-points="1"]') !== null`);
    assert.ok((await evaluate("window.__auctionSounds")).length >= 4, "unlock plus shuffle, flip and reveal audio sources started");
    assert.ok((await evaluate("window.__auctionSounds")).every((duration) => duration > 0));
    const cardFront = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(output, "auction-card-front.png"), Buffer.from(cardFront.data, "base64"));
    const drawnRevision = (await current()).revision;
    await click("효과음 켜짐");
    assert.equal((await current()).revision, drawnRevision, "sound toggling never mutates the auction");
    report.push("카드 뒷면 → 회전 → 선수 공개·1P 표시, V1 WAV 3종 디코딩 및 오디오 출력 시작 확인");

    await call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await until("document.body.innerText.includes('오프라인')");
    await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await until("document.body.innerText.includes('연결됨')");
    report.push("오프라인 안내와 재연결 시 서버 상태 복구 확인");

    await evaluate(await readFile(resolve(root, "node_modules/axe-core/axe.min.js"), "utf8"));
    const accessibility = await evaluate("axe.run(document.querySelector('[aria-label=\"멸망전 운영 작업\"]'), { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }).then(r => r.violations.map(v => ({id:v.id,impact:v.impact,nodes:v.nodes.length})))");
    assert.deepEqual(accessibility, []); assert.deepEqual(exceptions, []);
    report.push("운영 작업 영역 axe 접근성 검사 및 브라우저 예외 없음");
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await call("Page.navigate", { url: `${origin}/competitions/destruction/${tournamentId}` });
    await until(`document.querySelector('[data-auction-phase="revealed"] [data-auction-points="1"]') !== null`);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-auction-phase] > div:nth-child(2)')).animationName"), "none");
    assert.equal((await current()).revision, drawnRevision);
    report.push("공개 화면도 동일한 선수·포인트 카드 사용, 동작 줄이기 설정에서는 즉시 공개, 조회로 경매 변경 없음");
    await call("Page.navigate", { url: origin + "/admin/progress/destruction/" + mayhemId });
    await until("document.body.innerText.includes('운영자 확인 입력') && document.body.innerText.includes('연결됨')");
    await evaluate("(() => { const summary = [...document.querySelectorAll('summary')].find(s => s.textContent === '운영자 확인 입력'); summary.click(); const form = summary.parentElement.querySelector('form'); for (const [name, value] of [['wins','55'],['losses','45'],['evidence','합성 전적 클라이언트 최근 100판 · 2026-09-25']]) { const el = form.elements.namedItem(name); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, value); el.dispatchEvent(new Event('input',{bubbles:true})); } form.elements.namedItem('verified').click(); })()");
    await until("[...document.querySelectorAll('button')].some(b => b.textContent === '확인 전적 저장' && !b.disabled)");
    await click("확인 전적 저장");
    await until("document.body.innerText.includes('운영자 확인 · 합성 전적 클라이언트') && document.body.innerText.includes('작업을 반영했습니다.')");
    const verifiedResponse = await fetch(origin + "/api/admin/competitions/destruction/" + mayhemId, { headers: { Cookie: "klol_v2_session=" + adminToken } });
    assert.equal(await evaluate("[...document.querySelectorAll('select[name=captainParticipantId]')][0].textContent.includes('주장 지원')"), true);
    const verifiedState = (await verifiedResponse.json()).destruction;
    const rated = verifiedState.participants.find(p => p.aramRecord);
    assert.equal(rated.aramRecord.mode, "ARAM_MAYHEM"); assert.equal(rated.aramRecord.source, "ADMIN_VERIFIED");
    assert.equal(rated.aramRecord.wins, 55); assert.equal(rated.minimumBid, 250);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === '주장·팀 확정').disabled"), true);
    report.push("증바람 모바일 확인 입력: 55승45패 → A등급·최소250P 저장, 미평가 선수 존재 시 주장 확정 차단");
    await call("Page.navigate", { url: origin + "/competitions/destruction/" + mayhemId });
    await until("document.body.innerText.includes('운영자 확인') && document.body.innerText.includes('100판 55승 45패')");
    assert.equal(await evaluate("document.body.innerText.includes('합성 전적 클라이언트')"), false);
    report.push("증바람 공개 화면: 운영자 확인 출처·등급 공개, 관리자 확인 근거 비공개");
    await call("Page.navigate", { url: origin + "/admin/progress/destruction/" + tournamentId });
    await until("document.querySelector('[data-selected-stage=AUCTION]') !== null && document.body.innerText.includes('연결됨')");
    for (const stage of ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"]) {
      await evaluate("document.querySelector('nav[aria-label=\"멸망전 진행 단계\"] a[href=\"?stage=" + stage + "\"]').click()");
      await until("document.querySelector('[data-selected-stage=" + stage + "]') !== null && new URL(location.href).searchParams.get('stage') === '" + stage + "'");
      if (stage !== "AUCTION") assert.equal(await evaluate("document.querySelector('input[name=purchasePoints]') === null"), true);
    }
    await evaluate("window.__beforeStageReload = true");
    await call("Page.reload");
    await until("window.__beforeStageReload === undefined && document.querySelector('[data-selected-stage=COMPLETED]') !== null && document.body.innerText.includes('연결됨')");
    await evaluate("history.back()");
    await until("document.querySelector('[data-selected-stage=TOURNAMENT]') !== null");
    assert.equal((await current()).revision, drawnRevision);
    report.push("7단계 클릭·URL·새로고침·뒤로가기: 단계별 화면 조회, 경매 revision 변경 없음");
    await call("Page.navigate", { url: origin + "/admin/progress/destruction/new" });
    await until("document.querySelector('select[name=gameMode]') !== null");
    for (const mode of ["ARAM", "ARAM_MAYHEM", "CLASSIC"]) {
      await evaluate("(() => { const el = document.querySelector('select[name=gameMode]'); el.value = '" + mode + "'; el.dispatchEvent(new Event('change', {bubbles:true})); })()");
      await until(mode === "CLASSIC" ? "document.querySelector('input[name=TOP]') !== null && !document.querySelector('input[name=recruitmentLimit]')" : "document.querySelector('input[name=recruitmentLimit]') !== null && !document.querySelector('input[name=TOP]')");
    }
    report.push("생성 화면: 칼바람·증바람은 총 모집 상한, 협곡은 포지션별 상한");
    await evaluate("document.querySelector('input[name=title]').value = '중계 서버 revision 검증 대회'");
    await click("멸망전 생성");
    await until("document.querySelector('[data-selected-stage=PLANNED]') !== null && document.body.innerText.includes('중계 서버 revision 검증 대회')");
    report.push("전용 revision 헤더로 대회 생성: 응답 중계 환경에서 201 성공·생성된 운영 화면 이동");
    await call("Network.setCookie", { name: "klol_v2_account_session", value: accountToken, url: origin, httpOnly: true, sameSite: "Strict" });
    for (const id of [...recruitingIds, classicRecruitingId]) {
      await call("Page.navigate", { url: origin + "/competitions/destruction/" + id });
      await until("document.querySelector('select[name=captainVolunteer]') !== null");
      assert.equal(await evaluate("document.querySelector('select[name=position]') === null"), id !== classicRecruitingId);
      await evaluate("document.querySelector('select[name=captainVolunteer]').value = 'true'");
      await click("신청 수정");
      await until("document.body.innerText.includes('작업을 반영했습니다.')");
      const response = await fetch(origin + "/api/admin/competitions/destruction/" + id, {headers:{Cookie:"klol_v2_session="+adminToken}});
      const state = (await response.json()).destruction;
      assert.equal(state.revision, 2); assert.ok(state.applications.every(p => id === classicRecruitingId ? p.position !== null : p.position === null));
      const ownResponse = await fetch(origin + "/api/competitions/destruction/" + id + "/application", {headers:{Cookie:"klol_v2_account_session="+accountToken}});
      const ownBody = await ownResponse.json();
      assert.equal(ownBody.application.captainVolunteer, true);
      await evaluate("window.__captainBeforeReload = true");
      await call("Page.reload");
      await until("window.__captainBeforeReload === undefined && document.querySelector('select[name=captainVolunteer]')?.value === 'true'");
      await call("Page.navigate", { url: origin + "/admin/progress/destruction/" + id });
      await until("document.querySelector('[data-application-id]') !== null && document.body.innerText.includes('연결됨')");
      assert.equal(await evaluate(`document.querySelector('[data-application-id="${ownBody.application.applicationId}"]').innerText.includes('주장 지원')`), true);
      await call("Page.navigate", { url: origin + "/competitions/destruction/" + id });
      await until("document.querySelector('select[name=captainVolunteer]')?.value === 'true'");
      await evaluate("document.querySelector('select[name=captainVolunteer]').value = 'false'");
      await click("신청 수정");
      await until("document.body.innerText.includes('작업을 반영했습니다.')");
      const optOut = await fetch(origin + "/api/competitions/destruction/" + id + "/application", {headers:{Cookie:"klol_v2_account_session="+accountToken}});
      assert.equal((await optOut.json()).application.captainVolunteer, false);
    }
    report.push("세 모드 주장 지원: 저장·새로고침 유지·운영 심사 표시·일반 선수로 변경, 협곡만 포지션 선택");
    const recruitmentState = async (id) => {
      const response = await fetch(origin + "/api/admin/competitions/destruction/" + id, { headers: { Cookie: "klol_v2_session=" + adminToken } });
      assert.equal(response.status, 200);
      return (await response.json()).destruction;
    };
    const reviewButton = (id, label = "참가 확정") => `[...document.querySelector('[data-application-id="${id}"]').querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)})`;
    const openRecruitment = async (id) => {
      await call("Page.navigate", { url: origin + "/admin/progress/destruction/" + id });
      await until("document.querySelector('[data-application-id]') !== null && document.body.innerText.includes('연결됨')");
    };
    // Hold the first HTTP write to check row isolation and ordering deterministically.
    const queueId = recruitingIds[0];
    await openRecruitment(queueId);
    const queueBefore = await recruitmentState(queueId);
    const candidates = queueBefore.applications.filter(a => a.status === "APPLIED");
    assert.equal(candidates.length, 3);
    let heldRefresh;
    events.set("Fetch.requestPaused", async (event) => {
      if (!heldRefresh) heldRefresh = event.requestId;
      else await call("Fetch.continueResponse", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: origin + "/admin/progress/destruction/" + queueId + "*", requestStage: "Response" }] });
    await evaluate(reviewButton(candidates[0].id) + ".click()");
    for (let i = 0; i < 70 && !heldRefresh; i += 1) await new Promise(done => setTimeout(done, 100));
    assert.ok(heldRefresh, "router refresh response held");
    await writeFile(join(output, "refresh-pending.json"), JSON.stringify(await evaluate(`({ text: document.body.innerText, rows: [...document.querySelectorAll('[data-application-id]')].map(row=>({id:row.dataset.applicationId,busy:row.getAttribute('aria-busy'),buttons:[...row.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled}))}))})`), null, 2));
    assert.equal(await evaluate(reviewButton(candidates[1].id) + ".disabled"), false, "other application remains clickable during RSC refresh");
    await call("Fetch.continueResponse", { requestId: heldRefresh });
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0");
    assert.equal(await evaluate(reviewButton(candidates[1].id) + ".disabled"), false, "other application remains clickable after refresh");
    await evaluate(reviewButton(candidates[0].id, "예비 선수") + ".click()");
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0");
    queueBefore.revision += 2;
    report.push("참가 확정 저장 직후 RSC 갱신 지연 중 및 갱신 완료 후 다른 행 활성 유지");
    let heldRequest;
    let writes = 0;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.request.method === "PATCH") {
        writes += 1;
        if (!heldRequest) { heldRequest = event.requestId; return; }
      }
      await call("Fetch.continueRequest", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/admin/competitions/destruction/" + queueId, requestStage: "Request" }] });
    await evaluate(`(() => { const b = ${reviewButton(candidates[0].id)}; b.click(); b.click(); })()`);
    await until(`document.querySelector('[data-application-id="${candidates[0].id}"]').getAttribute('aria-busy') === 'true'`);
    for (const candidate of candidates.slice(1)) {
      assert.equal(await evaluate(reviewButton(candidate.id) + ".disabled"), false);
      await evaluate(reviewButton(candidate.id) + ".click()");
    }
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 3");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"멸망전 운영 작업\"]').getAttribute('aria-busy')"), "false");
    assert.equal(writes, 1);
    await evaluate(`document.querySelector('[data-application-id="${candidates[0].id}"]').scrollIntoView({ block: 'center' })`);
    const waitingShot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(join(output, "recruitment-queued.png"), Buffer.from(waitingShot.data, "base64"));
    await call("Fetch.continueRequest", { requestId: heldRequest });
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0 && document.body.innerText.includes('20/20')");
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    const queueAfter = await recruitmentState(queueId);
    assert.equal(queueAfter.revision, queueBefore.revision + 3);
    assert.equal(queueAfter.applications.filter(a => a.status === "CONFIRMED").length, 20);
    assert.equal(writes, 3);
    report.push("참가 심사: 첫 요청 지연 중 다른 두 선수 클릭 가능, 행별 대기 표시, 중복 클릭 무시, 3건 순차 저장·20명 확정");

    const retryId = recruitingIds[1];
    await openRecruitment(retryId);
    const retryBefore = await recruitmentState(retryId);
    const retryCandidates = retryBefore.applications.filter(a => a.status === "APPLIED");
    let heldRetry;
    let dropped = false;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.responseStatusCode) {
        if (event.request.method === "PATCH" && !dropped) { dropped = true; await call("Fetch.failRequest", { requestId: event.requestId, errorReason: "ConnectionClosed" }); }
        else await call("Fetch.continueResponse", { requestId: event.requestId });
      } else if (event.request.method === "PATCH" && !heldRetry) heldRetry = event.requestId;
      else await call("Fetch.continueRequest", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: ["Request", "Response"].map(requestStage => ({ urlPattern: origin + "/api/admin/competitions/destruction/" + retryId, requestStage })) });
    for (const candidate of retryCandidates) await evaluate(reviewButton(candidate.id) + ".click()");
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 3");
    await call("Fetch.continueRequest", { requestId: heldRetry });
    await until("document.body.innerText.includes('요청 결과 다시 확인') && document.body.innerText.includes('심사 2건을 취소했습니다')");
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    const retryCommitted = await recruitmentState(retryId);
    assert.equal(retryCommitted.revision, retryBefore.revision + 1);
    let heldRecheck;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.request.method === "PATCH") heldRecheck = event.requestId;
      else await call("Fetch.continueRequest", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/admin/competitions/destruction/" + retryId, requestStage: "Request" }] });
    await click("요청 결과 다시 확인");
    await until("document.body.innerText.includes('심사 결과를 확인하고 최신 상태를 불러오고 있습니다')");
    assert.equal(await evaluate(reviewButton(retryCandidates[1].id) + ".disabled"), true);
    await call("Fetch.continueRequest", { requestId: heldRecheck });
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0 && !document.body.innerText.includes('요청 결과 다시 확인')");
    assert.equal((await recruitmentState(retryId)).revision, retryCommitted.revision);
    assert.equal(await evaluate(reviewButton(retryCandidates[1].id) + ".disabled"), false);
    report.push("심사 응답 유실: 미전송 2건 취소 안내, 같은 키 재확인으로 중복 확정 없이 복구");

    let conflictingRequest;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.request.method === "PATCH" && !conflictingRequest) conflictingRequest = event.requestId;
      else await call("Fetch.continueRequest", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/admin/competitions/destruction/" + retryId, requestStage: "Request" }] });
    for (const candidate of retryCandidates.slice(1)) await evaluate(reviewButton(candidate.id) + ".click()");
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 2");
    const concurrent = await fetch(origin + "/api/admin/competitions/destruction/" + retryId, {
      method: "PATCH", headers: { Cookie: "klol_v2_session=" + adminToken, "Content-Type": "application/json", "X-Destruction-Revision": '"' + retryCommitted.revision + '"', "Idempotency-Key": "browser-review-conflict-" + crypto.randomUUID(), Origin: origin },
      body: JSON.stringify({ type: "SET_APPLICATION_STATUS", payload: { applicationId: retryCandidates[2].id, status: "RESERVE" } }),
    });
    assert.equal(concurrent.status, 200);
    await call("Fetch.continueRequest", { requestId: conflictingRequest });
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0 && document.body.innerText.includes('심사 1건을 취소했습니다')");
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    const conflictAfter = await recruitmentState(retryId);
    assert.equal(conflictAfter.revision, retryCommitted.revision + 1);
    assert.equal(conflictAfter.applications.find(a => a.id === retryCandidates[1].id).status, "APPLIED");
    assert.equal(conflictAfter.applications.find(a => a.id === retryCandidates[2].id).status, "RESERVE");
    assert.equal(await evaluate(reviewButton(retryCandidates[1].id) + ".disabled"), false);
    report.push("다른 운영자와 revision 충돌: 현재 요청 거절·대기 요청 취소, 최신 목록 복구, 상대 심사 보존");
    // Another operator can commit between our response and its router refresh.
    // The next queued intent must keep the original revision chain, not overwrite that change.
    let heldGap;
    events.set("Fetch.requestPaused", async (event) => {
      if (event.request.method === "PATCH" && !heldGap) heldGap = event.requestId;
      else await call("Fetch.continueResponse", { requestId: event.requestId });
    });
    await call("Fetch.enable", { patterns: [{ urlPattern: origin + "/api/admin/competitions/destruction/" + retryId, requestStage: "Response" }] });
    await evaluate(reviewButton(retryCandidates[1].id) + ".click()");
    await evaluate(reviewButton(retryCandidates[2].id, "신청 거절") + ".click()");
    for (let i = 0; i < 70 && !heldGap; i += 1) await new Promise(done => setTimeout(done, 100));
    assert.ok(heldGap);
    const gapCommitted = await recruitmentState(retryId);
    assert.equal(gapCommitted.revision, conflictAfter.revision + 1);
    const intervening = await fetch(origin + "/api/admin/competitions/destruction/" + retryId, {
      method: "PATCH", headers: { Cookie: "klol_v2_session=" + adminToken, "Content-Type": "application/json", "X-Destruction-Revision": '"' + gapCommitted.revision + '"', "Idempotency-Key": "browser-review-refresh-gap-" + crypto.randomUUID(), Origin: origin },
      body: JSON.stringify({ type: "SET_APPLICATION_STATUS", payload: { applicationId: retryCandidates[2].id, status: "CONFIRMED" } }),
    });
    assert.equal(intervening.status, 200);
    await call("Fetch.continueResponse", { requestId: heldGap });
    await until("document.querySelectorAll('[data-application-id][aria-busy=true]').length === 0 && document.body.innerText.includes('다른 작업으로 대회 정보가 변경됐습니다')");
    await call("Fetch.disable"); events.delete("Fetch.requestPaused");
    const gapAfter = await recruitmentState(retryId);
    assert.equal(gapAfter.revision, gapCommitted.revision + 1);
    assert.equal(gapAfter.applications.find(a => a.id === retryCandidates[2].id).status, "CONFIRMED");
    report.push("저장 응답과 화면 갱신 사이의 외부 변경도 감지: 대기 심사의 원래 revision 유지, 다른 운영자의 확정 덮어쓰기 방지");
    assert.deepEqual(exceptions, []);
    await writeFile(join(output, "interactions.json"), JSON.stringify({ passed: report, accessibility, exceptions }, null, 2));
    await call("Browser.close");
  } finally {
    socket?.close();
    for (const item of pending.values()) clearTimeout(item.timer);
    if (chrome.exitCode === null) { chrome.kill(); await new Promise((done) => setTimeout(done, 500)); }
    const absolute = resolve(profile);
    if (!absolute.startsWith(`${parent}${sep}`) || !absolute.includes("klol-destruction-browser-")) throw new Error("Unexpected browser profile path");
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  }
}
