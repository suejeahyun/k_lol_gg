import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

function load(file, dependencies, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, crypto: webcrypto, ...globals, require(specifier) {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected review dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}
const keyStore = load("modules/matches/infrastructure/client-match-mutation-key-store.ts", {});
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
const participants = Array.from({ length: 10 }, (_, index) => ({ playerId: `player-${index}`, championKey: `champion-${index}`, team: index < 5 ? "BLUE" : "RED", position: positions[index % 5], kills: 1, deaths: 2, assists: 3 }));
const catalog = { players: participants.map((row) => ({ id: row.playerId, nickname: row.playerId, tagLine: "QA", status: "ACTIVE" })), champions: participants.map((row) => ({ key: row.championKey, displayName: row.championKey, status: "ACTIVE" })), seasons: [{ id: "season", name: "합성 시즌", status: "ACTIVE" }] };
const fixture = { id: "synthetic-submission", publicCode: "MR2A1B2C3D4E5F60708", title: "합성 접수", organizer: "합성", source: "WEB", status: "PENDING_REVIEW", revision: 3, seasonId: "season", images: [], expectedGameCount: 2, reviewedResult: { formulaVersion: "V1_COMPAT_1", games: [1, 2].map((gameNumber) => ({ gameNumber, durationSeconds: 1800, winnerTeam: "BLUE", participants })) } };
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);
const firstKill = (tree) => find(tree, (node) => node.type === "input" && node.props["aria-label"] === "킬");
function harness(send) {
  const slots = [], requests = [], navigation = [], transitions = [];
  let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(read) { return read(); },
    useEffect() {},
    useTransition() { const [pending, setPending] = hooks.useState(false); return [pending, (operation) => { setPending(true); operation(); transitions.push(() => setPending(false)); }]; },
  };
  const component = load("app/(admin)/admin/matches/submissions/[submissionId]/submission-review.tsx", {
    react: hooks, "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ refresh: () => navigation.push("refresh") }) },
    "@/components/theme/theme-icons": { AlertTriangle: () => null, CheckCircle2: () => null },
    "@/modules/matches": { MATCH_POSITIONS: positions, MATCH_TEAMS: ["BLUE", "RED"], isUuid: (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) },
    "@/modules/matches/infrastructure/admin-import-recovery": { clearAdminImportRecovery() {} },
    "@/modules/matches/infrastructure/client-match-mutation-key-store": keyStore,
    "../../bounded-picker": { BoundedPicker: () => null },
    "../../submission-labels": load("app/(admin)/admin/matches/submission-labels.ts", {}),
    "../../matches-admin.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  }, {
    window: { confirm: () => true, requestAnimationFrame: (callback) => callback() },
    document: { activeElement: null }, HTMLElement: class {},
    fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, url, options); },
  }).SubmissionReview;
  return { requests, navigation, render(submission = fixture, extra = {}) { cursor = 0; return component({ submission, catalog, ...extra }); }, finishRefresh() { transitions.splice(0).forEach((finish) => finish()); } };
}
const saved = { ok: true, status: 200, json: async () => ({ submissionId: fixture.id, revision: 4, status: "PENDING_REVIEW" }) };

test("saving a reviewed roster cannot approve a different edit made before its response", async () => {
  let finish;
  const subject = harness(() => new Promise((resolve) => { finish = resolve; }));
  const before = subject.render();
  const request = button(before, "검토안 저장").props.onClick();
  firstKill(before).props.onChange({ target: { value: "99" } });
  finish(saved); await request;
  assert.equal(firstKill(subject.render()).props.value, 1, "the submitted roster must stay the roster shown as saved");
  assert.equal(JSON.parse(subject.requests[0].body).reviewedResult.games[0].participants[0].kills, 1);
});

test("uncertain review writes retry the exact body/revision with the same key", async () => {
  const subject = harness((attempt) => { if (attempt === 1) throw new Error("synthetic lost response"); return saved; });
  await button(subject.render(), "검토안 저장").props.onClick();
  await button(subject.render(), "검토안 저장").props.onClick();
  assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(subject.requests[0].headers["If-Match"], subject.requests[1].headers["If-Match"]);
});

test("review inputs and repeat mutations stay locked through response and refreshed projection", async () => {
  let finish;
  const subject = harness(() => new Promise((resolve) => { finish = resolve; }));
  const before = subject.render();
  const request = button(before, "검토안 저장").props.onClick();
  await button(before, "검토안 저장").props.onClick();
  assert.equal(subject.requests.length, 1, "same-tick handler invocations must issue one write");
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, true);
  finish(saved); await request;
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, true, "server refresh still pending");
  await button(subject.render(), "승인·경기 공개").props.onClick();
  assert.equal(subject.requests.length, 1);
  const refreshed = { ...fixture, revision: 4 };
  subject.render(refreshed); subject.finishRefresh();
  const settled = subject.render(refreshed);
  assert.equal(find(settled, (node) => node.type === "fieldset").props.disabled, false);
  assert.equal(button(settled, "승인·경기 공개").props.disabled, false);
  firstKill(settled).props.onChange({ target: { value: "7" } });
  assert.equal(button(subject.render(refreshed), "승인·경기 공개").props.disabled, true, "a later deliberate edit still requires saving");
});

test("a validation failure permits input correction with a new request identity", async () => {
  const subject = harness(() => ({ ok: false, status: 400, json: async () => ({ title: "입력 오류", detail: "합성 검토 오류" }) }));
  await button(subject.render(), "검토안 저장").props.onClick();
  const failed = subject.render();
  assert.equal(find(failed, (node) => node.type === "fieldset").props.disabled, false);
  find(failed, (node) => node.type === "select" && node.props.value === "BLUE").props.onChange({ target: { value: "RED" } });
  await button(subject.render(), "검토안 저장").props.onClick();
  assert.notEqual(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.equal(JSON.parse(subject.requests[1].body).reviewedResult.games[0].winnerTeam, "RED");
});

test("412 preserves the local roster and requires explicit comparison before continuing", async () => {
  const latest = { ...fixture, revision: 5, reviewedResult: { ...fixture.reviewedResult, games: fixture.reviewedResult.games.map((game) => ({ ...game, participants: game.participants.map((row) => ({ ...row, kills: 8 })) })) } };
  const subject = harness((_attempt, _url, options) => options.method
    ? { ok: false, status: 412, json: async () => ({ title: "동시 수정", detail: "최신 상태를 확인하세요." }) }
    : { ok: true, json: async () => ({ submission: latest }) });
  await button(subject.render(), "검토안 저장").props.onClick();
  assert.equal(firstKill(subject.render()).props.value, 1);
  subject.finishRefresh();
  assert.equal(button(subject.render(), "검토안 저장").props.disabled, true);
  button(subject.render(), "서버 검토안 불러오기").props.onClick();
  assert.equal(firstKill(subject.render()).props.value, 8);
  assert.equal(button(subject.render(), "검토안 저장").props.disabled, false);
});

test("an uncertain approval retries its original command and locks the confirmed terminal state", async () => {
  const subject = harness((attempt) => { if (attempt === 1) throw new Error("synthetic response loss"); return { ok: true, status: 201, json: async () => ({ submissionId: fixture.id, revision: 4, status: "APPROVED", matchId: "9a7eac58-d907-4576-9aab-b9294bd9c74e" }) }; });
  await button(subject.render(), "승인·경기 공개").props.onClick();
  await button(subject.render(), "승인·경기 공개").props.onClick();
  assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(button(subject.render(), "승인·경기 공개"), null);
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, true);
});

test("review state uses readable labels while source comparison and real OCR warnings remain available", () => {
  for (const [ocrStatus, label] of [["NOT_REQUESTED", "분석 전"], ["PENDING", "분석 중"], ["SUCCEEDED", "분석 완료"], ["FAILED", "분석 실패"]]) {
    const subject = harness(() => saved);
    const view = subject.render({ ...fixture, images: [{ id: "synthetic-image", gameNumber: 1, revision: 1, byteSize: 2048, sha256: "a".repeat(64), ocrStatus, ocrCandidate: null, ocrErrorCode: null }] });
    assert.equal(find(view, (node) => node.type === "input" && node.props.readOnly).props.value, "검토 대기 · 변경 버전 3");
    assert.ok(find(view, (node) => node.type === "strong" && React.Children.toArray(node.props.children).join("") === `1게임 · ${label}`));
    assert.ok(find(view, (node) => node.type === "img" && node.props.alt === "1게임 비공개 스코어보드"));
    assert.ok(find(view, (node) => node.type === "p" && typeof node.props.children === "string" && node.props.children.includes("원본 대조 확인을 완료해야")));
    assert.equal(find(view, (node) => node.type === "strong" && node.props.children === "OCR 확인 경고"), null);
  }
  const withWarning = harness(() => saved).render({ ...fixture, images: [{ id: "synthetic-image", gameNumber: 1, revision: 1, byteSize: 2048, ocrStatus: "SUCCEEDED", ocrCandidate: { participants: [{ slot: 1, nickname: "합성", championKey: null, team: null, position: null, kills: 1, deaths: 0, assists: 0, confidence: 0.5 }] }, ocrErrorCode: null }] });
  assert.ok(find(withWarning, (node) => node.type === "li" && node.props.children === "1게임 OCR 1번: 팀 또는 포지션을 판별하지 못했습니다."));
});

const linkedTeam = { draftId: "synthetic-team", title: "현재 합성 팀", revision: 7, assignments: participants.map(({ playerId, team, position }) => ({ playerId, team, position })).reverse() };
const emptyPlayers = { ...fixture, reviewedResult: { ...fixture.reviewedResult, games: fixture.reviewedResult.games.map((game) => ({ ...game, participants: game.participants.map((row) => ({ ...row, playerId: "" })) })) } };
function playerPicker(tree, label) { return find(tree, (node) => node.props.ariaLabel === label); }
test("explicitly loading the current linked team fills each game's empty slots without changing results and requires every row to be checked", () => {
  const subject = harness(() => saved);
  const before = subject.render(emptyPlayers, { linkedTeam });
  assert.equal(playerPicker(before, "블루 탑 플레이어").props.value, "", "linking does not silently populate a roster");
  const loadTeam = button(before, "현재 팀 배치 불러오기"); assert.ok(loadTeam, "linked team needs an explicit initial-roster action");
  loadTeam.props.onClick();
  const loaded = subject.render(emptyPlayers, { linkedTeam });
  assert.equal(playerPicker(loaded, "블루 탑 플레이어").props.value, "player-0");
  assert.equal(playerPicker(loaded, "레드 서포터 플레이어").props.value, "player-9");
  assert.equal(firstKill(loaded).props.value, 1);
  assert.equal(playerPicker(loaded, "블루 탑 챔피언").props.value, "champion-0");
  assert.equal(button(loaded, "승인·경기 공개").props.disabled, true);
  assert.equal(button(loaded, "검토안 저장").props.disabled, true);
  let unchecked = 0;
  const visit = (node) => { if (!React.isValidElement(node)) return; if (node.type === "button" && node.props.children === "원본 대조 확인") unchecked++; React.Children.forEach(node.props.children, visit); };
  visit(loaded); assert.equal(unchecked, 20);
  assert.equal(subject.requests.length, 0, "loading a suggestion does not persist it or approve a match");
});

test("loading a linked team never overwrites an existing player selection or bypasses a terminal review", () => {
  const subject = harness(() => saved);
  const editable = subject.render(emptyPlayers, { linkedTeam });
  const priorButton = button(editable, "현재 팀 배치 불러오기"); assert.ok(priorButton);
  playerPicker(editable, "블루 탑 플레이어").props.onChange("player-9");
  const changed = subject.render(emptyPlayers, { linkedTeam });
  assert.equal(button(changed, "현재 팀 배치 불러오기"), null);
  priorButton.props.onClick();
  assert.equal(playerPicker(subject.render(emptyPlayers, { linkedTeam }), "블루 탑 플레이어").props.value, "player-9");
  for (const status of ["REJECTED", "APPROVED", "CANCELLED"]) {
    const closed = harness(() => saved).render({ ...emptyPlayers, status }, { linkedTeam });
    const loadTeam = button(closed, "현재 팀 배치 불러오기");
    assert.ok(!loadTeam || loadTeam.props.disabled, status);
  }
  assert.equal(button(harness(() => saved).render(emptyPlayers), "현재 팀 배치 불러오기"), null);
});

test("unconfirmed review success cannot confirm a different submission, advance revision or consume retry identity", async () => {
  for (const body of [null, {}, { submissionId: fixture.id, revision: 3, status: "PENDING_REVIEW" }, { submissionId: "other-submission", revision: 4, status: "PENDING_REVIEW" }, { submissionId: fixture.id, revision: 4, status: "APPROVED" }]) {
    const subject = harness(() => ({ ok: true, status: 200, json: async () => body }));
    await button(subject.render(), "검토안 저장").props.onClick();
    assert.deepEqual(subject.navigation, []);
    await button(subject.render(), "검토안 저장").props.onClick();
    assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
    assert.equal(subject.requests[1].headers["If-Match"], '"3"');
    assert.ok(find(subject.render(), (node) => node.props.role === "alert"));
  }
});

test("unconfirmed OCR success preserves image revision and the exact retry key without refreshing", async () => {
  const image = { id: "synthetic-image", gameNumber: 1, revision: 2, byteSize: 2048, ocrStatus: "FAILED", ocrCandidate: null, ocrErrorCode: "SYNTHETIC" };
  const current = { ...fixture, images: [image] };
  for (const body of [{}, { submissionId: fixture.id, imageId: "other-image", revision: 3, ocrStatus: "SUCCEEDED", ocrErrorCode: null }, { submissionId: fixture.id, imageId: image.id, revision: 2, ocrStatus: "SUCCEEDED", ocrErrorCode: null }, { submissionId: fixture.id, imageId: image.id, revision: 3, ocrStatus: "PENDING", ocrErrorCode: null }]) {
    const subject = harness(() => ({ ok: true, status: 200, json: async () => body }));
    await button(subject.render(current), "OCR 다시 분석").props.onClick();
    assert.deepEqual(subject.navigation, []); assert.equal(subject.requests.length, 1);
    await button(subject.render(current), "OCR 다시 분석").props.onClick();
    assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
    assert.equal(subject.requests[1].headers["If-Match"], '"2"');
  }
});

test("confirmed OCR success and unavailable OCR results both advance only the image revision and require a fresh comparison", async () => {
  for (const ocrStatus of ["SUCCEEDED", "FAILED"]) {
    const image = { id: "synthetic-image", gameNumber: 1, revision: 2, byteSize: 2048, ocrStatus: "FAILED", ocrCandidate: null, ocrErrorCode: "SYNTHETIC" };
    const current = { ...fixture, images: [image] };
    const body = { submissionId: fixture.id, imageId: image.id, revision: 3, ocrStatus, ocrErrorCode: ocrStatus === "SUCCEEDED" ? null : "SYNTHETIC_UNAVAILABLE" };
    const subject = harness((_attempt, _url, options) => options.method
      ? { ok: true, status: 200, json: async () => body }
      : { ok: true, status: 200, json: async () => ({ submission: { ...current, images: [{ ...image, revision: 3 }] } }) });
    await button(subject.render(current), "OCR 다시 분석").props.onClick();
    assert.deepEqual(subject.navigation, ["refresh"]); assert.equal(subject.requests.length, 2);
    subject.finishRefresh();
    const next = subject.render(current);
    assert.equal(find(next, (node) => node.type === "input" && node.props.readOnly).props.value, "검토 대기 · 변경 버전 3");
    assert.equal(button(next, "승인·경기 공개").props.disabled, true);
    assert.equal(button(next, "검토안 저장").props.disabled, true);
    await button(next, "OCR 다시 분석").props.onClick();
    assert.equal(subject.requests[2].headers["If-Match"], '"3"');
    assert.notEqual(subject.requests[0].headers["Idempotency-Key"], subject.requests[2].headers["Idempotency-Key"]);
  }
});
