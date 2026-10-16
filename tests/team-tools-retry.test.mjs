import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

function load(file, dependencies, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, crypto: webcrypto, ...globals, require: (specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected retry dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return result.exports;
}

const season = load("modules/seasons/domain/season.ts", {});
const keys = load("modules/seasons/application/client-mutation-key-store.ts", { "../domain/season": season });
const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"];
const formulaVersion = "V2_INHOUSE_RELAXED_2026_10_16";
const share = load("modules/team-tools/domain/team-balance-share.ts", { "./team-balance": { TEAM_BALANCE_POSITIONS: positions, TEAM_BALANCE_V1_FORMULA_VERSION: formulaVersion } });

// A small event harness runs the real component handlers and request-key store.
// Effects and presentation components are omitted; no network or database is used.
function harness(file, exportName, send, withSelectedPlayers = false, evaluateLayout = () => ({ score: { teamStrength: { redTotal: 250, blueTotal: 250, difference: 0 } } })) {
  const slots = [];
  let cursor = 0;
  const requests = [];
  const navigation = [];
  const transitions = [];
  const clipboard = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        let value = typeof initial === "function" ? initial() : initial;
        if (withSelectedPlayers && Array.isArray(value) && value.length === 10 && value.every((row) => row.playerId === "")) {
          value = value.map((row, rowIndex) => ({ ...row, playerId: `synthetic-player-${rowIndex}`, playerLabel: `합성 ${rowIndex}` }));
        }
        slots[index] = value;
      }
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo: (read) => read(),
    useEffect: () => {},
    useTransition() {
      const [pending, setPending] = hooks.useState(false);
      return [pending, (operation) => { setPending(true); operation(); transitions.push(() => setPending(false)); }];
    },
  };
  const component = load(file, {
    react: hooks,
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { useRouter: () => ({ push: (href) => navigation.push(href), refresh: () => navigation.push("refresh") }) },
    "@/components/usage/usage-actions": { recordUsageAction: () => {} },
    "@/components/theme/theme-icons": new Proxy({}, { get: () => () => null }),
    "@/modules/team-tools": { ...share, evaluateTeamBalanceLayout: evaluateLayout, TEAM_BALANCE_V1_FORMULA_VERSION: formulaVersion, TEAM_BALANCE_POSITIONS: positions, TEAM_BALANCE_PREFERENCES: ["MAIN", "SUB", "AUTO"], TEAM_BALANCE_TEAMS: ["BLUE", "RED"] },
    "@/modules/seasons/application/client-mutation-key-store": keys,
    "../team-tools.module.css": css,
    "../../../team-tools.module.css": css,
  }, { navigator: { clipboard: { writeText: async (value) => { clipboard.push(value); } } }, fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length); } })[exportName];
  return { render: (props) => { cursor = 0; return component(props); }, requests, navigation, clipboard, finishTransitions: () => transitions.splice(0).forEach((finish) => finish()) };
}

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const matched = find(child, predicate);
    if (matched) return matched;
  }
  return null;
}

const builderFile = "app/(public)/(tools)/tools/team-balance/team-balance-builder.tsx";
const workspaceFile = "app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx";
const createResult = { ok: true, json: async () => ({ location: "/tools/team-balance/drafts/synthetic" }) };
const mutationResult = { ok: true, json: async () => ({ revision: 2 }) };
const requestKey = (request) => request.headers["Idempotency-Key"];

test("a lost create response retries the exact draft request with its original idempotency key", async () => {
  const subject = harness(builderFile, "TeamBalanceBuilder", (attempt) => {
    if (attempt === 1) throw new Error("Synthetic lost response");
    return createResult;
  }, true);
  await subject.render().props.onSubmit({ preventDefault() {} });
  await subject.render().props.onSubmit({ preventDefault() {} });
  assert.equal(subject.requests.length, 2);
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(requestKey(subject.requests[0]), requestKey(subject.requests[1]));
  assert.deepEqual(subject.navigation, ["/tools/team-balance/drafts/synthetic"]);
  await subject.render().props.onSubmit({ preventDefault() {} });
  assert.equal(subject.requests.length, 2, "confirmed creation stays locked until navigation completes");
  assert.equal(subject.render().props["aria-busy"], true);
});

test("editing an unresolved draft request uses a new key and returning to the original input retains its retry", async () => {
  const subject = harness(builderFile, "TeamBalanceBuilder", () => { throw new Error("Synthetic lost response"); }, true);
  await subject.render().props.onSubmit({ preventDefault() {} });
  find(subject.render(), (node) => node.type === "input" && node.props.value === "오늘의 내전").props.onChange({ target: { value: "다른 합성 경기" } });
  await subject.render().props.onSubmit({ preventDefault() {} });
  assert.notEqual(requestKey(subject.requests[0]), requestKey(subject.requests[1]));
  find(subject.render(), (node) => node.type === "input" && node.props.value === "다른 합성 경기").props.onChange({ target: { value: "오늘의 내전" } });
  await subject.render().props.onSubmit({ preventDefault() {} });
  assert.equal(requestKey(subject.requests[0]), requestKey(subject.requests[2]));
});

test("draft workspace retries an uncertain mutation before refresh and separates later revisions", async () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", (attempt) => {
    if (attempt !== 2) throw new Error("Synthetic lost response");
    return mutationResult;
  });
  const draft = { id: "synthetic-draft", title: "합성 팀", revision: 1, evaluationRound: 1, status: "EVALUATED", candidates: [], participants: [], selectedCandidateSignature: null };
  async function reevaluate(revision) {
    const tree = subject.render({ draft: { ...draft, revision } });
    const actions = find(tree, (node) => node.props["aria-label"] === "초안 작업");
    const button = React.Children.toArray(actions.props.children).find((node) => node.type === "button" && React.Children.toArray(node.props.children).includes("최신 통계로 재평가"));
    assert.ok(button);
    await button.props.onClick();
  }
  await reevaluate(1);
  await reevaluate(1);
  assert.equal(requestKey(subject.requests[0]), requestKey(subject.requests[1]));
  assert.equal(subject.requests[0].headers["If-Match"], '"1"');
  assert.deepEqual(subject.navigation, ["refresh"]);
  await reevaluate(1);
  assert.equal(subject.requests.length, 2, "mutation controls stay locked while the refreshed server state is loading");
  subject.finishTransitions();
  await reevaluate(2);
  await reevaluate(3);
  assert.notEqual(requestKey(subject.requests[2]), requestKey(subject.requests[3]));
  assert.equal(subject.requests[3].headers["If-Match"], '"3"');
});

function selectedDraft(status = "EVALUATED") {
  const assignments = Array.from({ length: 10 }, (_, index) => ({ playerId: `synthetic-player-${index}`, team: index < 5 ? "BLUE" : "RED", position: positions[index % 5] }));
  const candidate = { id: "synthetic-candidate", evaluationRound: 1, rank: 1, source: "AUTO", criterion: "V1_AI_GLOBAL", signature: "synthetic-selected", assignments,
    score: { totalPenalty: 0, teamStrength: { blueTotal: 250, redTotal: 250, difference: 0 }, positionDifferenceTotal: 0, preference: { mainCount: 10, subCount: 0, autoCount: 0 }, positions: [] } };
  return { id: "synthetic-draft", title: "합성 팀", revision: 1, evaluationRound: 1, status, candidates: [candidate], selectedCandidateSignature: candidate.signature,
    participants: assignments.map((entry) => ({ playerId: entry.playerId, displayName: entry.playerId, eligiblePositions: [{ position: entry.position, preference: "MAIN" }], rating: null })) };
}
const buttonText = (node) => React.Children.toArray(node.props.children).filter((child) => typeof child === "string").join("").trim();
const buttonNamed = (tree, label) => find(tree, (node) => node.type === "button" && buttonText(node) === label);
const slot = (tree, index) => find(tree, (node) => node.props["data-manual-slot"] === index);
function swapCards(subject, props) {
  find(slot(subject.render(props), 0), (node) => node.type === "button").props.onClick();
  find(slot(subject.render(props), 5), (node) => node.type === "button").props.onClick();
}

test("a draft conflict preserves manual slots and blocks stale retries until the latest draft is accepted", async () => {
  for (const mode of ["OWNER", "ADMIN"]) {
    const draft = selectedDraft();
    const latest = { ...selectedDraft(), revision: 2, title: "다른 작업의 최신 팀" };
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", attempt => attempt === 1
      ? { ok: false, status: 412, json: async () => ({ detail: "다른 작업이 먼저 저장됨" }) }
      : attempt === 2 ? { ok: true, json: async () => ({ draft: latest }) } : mutationResult);
    const props = { draft, mode, endpointBase: `/api/${mode === "ADMIN" ? "admin/" : ""}team-tools/drafts/${draft.id}` };
    swapCards(subject, props);
    await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
    let tree = subject.render(props);
    assert.equal(subject.requests.length, 2, "412 reads the complete latest draft without refreshing away local slots");
    assert.equal(subject.requests[1].url, props.endpointBase);
    assert.deepEqual(subject.navigation, []);
    assert.match(slot(tree, 0).props["aria-label"], /synthetic-player-5/u);
    assert.equal(buttonNamed(tree, "수동 배치 평가·선택").props.disabled, true);
    await buttonNamed(tree, "수동 배치 평가·선택").props.onClick();
    assert.equal(subject.requests.length, 2, "a stale layout cannot be posted again while comparison is pending");
    assert.match(visibleText(tree), /다른 작업의 최신 팀/u);
    buttonNamed(tree, "내 수동 배치 유지").props.onClick();
    tree = subject.render(props);
    await buttonNamed(tree, "수동 배치 평가·선택").props.onClick();
    assert.equal(subject.requests[2].headers["If-Match"], '"2"');
    assert.equal(JSON.parse(subject.requests[2].body).layout[0].playerId, "synthetic-player-5");
    assert.notEqual(requestKey(subject.requests[0]), requestKey(subject.requests[2]));
  }
});

test("failed conflict reads retain manual input and offer a read-only retry before discard", async () => {
  const latest = { ...selectedDraft(), revision: 2, status: "ARCHIVED" };
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", attempt => attempt === 1
    ? { ok: false, status: 412, json: async () => ({}) }
    : attempt === 2 ? Promise.reject(new Error("offline")) : { ok: true, json: async () => ({ draft: latest }) });
  const props = { draft: selectedDraft() };
  swapCards(subject, props);
  await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
  let tree = subject.render(props);
  assert.match(slot(tree, 0).props["aria-label"], /synthetic-player-5/u);
  assert.equal(buttonNamed(tree, "수동 배치 평가·선택").props.disabled, true);
  await buttonNamed(tree, "최신 초안 다시 불러오기").props.onClick();
  tree = subject.render(props);
  assert.equal(buttonNamed(tree, "내 수동 배치 유지"), null, "archived drafts cannot accept local edits");
  buttonNamed(tree, "수동 변경 버리고 최신값 사용").props.onClick();
  tree = subject.render(props);
  assert.match(slot(tree, 0).props["aria-label"], /synthetic-player-0/u);
  assert.equal(buttonNamed(tree, "수동 배치 평가·선택").props.disabled, true);
});

test("a newer server prop during comparison can be reconciled with a read at the same revision", async () => {
  const latest = { ...selectedDraft(), revision: 2 };
  const newest = { ...selectedDraft(), revision: 3 };
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", attempt => attempt === 1
    ? { ok: false, status: 412, json: async () => ({}) }
    : attempt < 4 ? { ok: true, json: async () => ({ draft: attempt === 2 ? latest : newest }) } : mutationResult);
  const props = { draft: selectedDraft() };
  swapCards(subject, props);
  await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
  props.draft = newest;
  buttonNamed(subject.render(props), "내 수동 배치 유지").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  let tree = subject.render(props);
  assert.equal(subject.requests.length, 3, "an outdated comparison triggers another latest read");
  assert.ok(buttonNamed(tree, "내 수동 배치 유지"), "the current revision is valid for explicit comparison");
  assert.equal(buttonNamed(tree, "수동 배치 평가·선택").props.disabled, true);
  buttonNamed(tree, "내 수동 배치 유지").props.onClick();
  tree = subject.render(props);
  await buttonNamed(tree, "수동 배치 평가·선택").props.onClick();
  assert.equal(subject.requests[3].headers["If-Match"], '"3"');
  assert.equal(JSON.parse(subject.requests[3].body).layout[0].playerId, "synthetic-player-5");
});

test("changed participants or newly invalid manual assignments cannot be kept over a new draft", async () => {
  for (const participantsChanged of [true, false]) {
    const latest = { ...selectedDraft(), revision: 2 };
    if (participantsChanged) latest.participants[0] = { ...latest.participants[0], playerId: "replacement-player" };
    else latest.participants[0] = { ...latest.participants[0], eligiblePositions: [] };
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", attempt => attempt === 1
      ? { ok: false, status: 412, json: async () => ({}) }
      : { ok: true, json: async () => ({ draft: latest }) }, false, participants => {
      if (participants.some(participant => participant.eligiblePositions.length === 0)) throw new Error("invalid assignment");
      return { score: { teamStrength: { redTotal: 250, blueTotal: 250, difference: 0 } } };
    });
    const props = { draft: selectedDraft() };
    swapCards(subject, props);
    await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
    const tree = subject.render(props);
    assert.equal(buttonNamed(tree, "내 수동 배치 유지"), null);
    assert.ok(buttonNamed(tree, "수동 변경 버리고 최신값 사용"));
    assert.match(slot(tree, 0).props["aria-label"], /synthetic-player-5/u);
  }
});

test("manual edits cannot save, copy or submit the previous selected team before evaluation", async () => {
  for (const [mode, status] of [["OWNER", "EVALUATED"], ["OWNER", "SAVED"], ["ADMIN", "EVALUATED"], ["ADMIN", "SAVED"]]) {
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
    const props = { draft: selectedDraft(status), mode };
    swapCards(subject, props);
    const tree = subject.render(props);
    assert.equal(buttonNamed(tree, "선택 팀 저장").props.disabled, true);
    assert.equal(buttonNamed(tree, "팀 결과 복사").props.disabled, true);
    assert.equal(find(tree, (node) => typeof node.props.href === "string" && node.props.href.includes("/matches/")), null, "unevaluated local cards must not link to a different persisted roster");
    await buttonNamed(tree, "선택 팀 저장").props.onClick();
    await buttonNamed(tree, "팀 결과 복사").props.onClick();
    assert.equal(subject.requests.length, 0);
    assert.equal(subject.clipboard.length, 0);
    assert.ok(find(tree, (node) => node.props.role === "status" && node.props.children === "수동 변경 · 평가 필요"));
    buttonNamed(tree, "선택한 배치로 되돌리기").props.onClick();
    const restored = subject.render(props);
    assert.equal(buttonNamed(restored, "선택 팀 저장").props.disabled, status === "SAVED");
    assert.match(slot(restored, 0).props["aria-label"], /synthetic-player-0/u);
    const destination = find(restored, (node) => typeof node.props.href === "string" && node.props.href.includes("/matches/"));
    assert.equal(destination?.props.href, `${mode === "OWNER" ? "/matches/submit" : "/admin/matches/new"}?teamBalanceDraftId=${props.draft.id}`);
    await buttonNamed(restored, "팀 결과 복사").props.onClick();
    assert.match(subject.clipboard[0], /^BLUE synthetic-player-0/u);
  }
});

test("manual selection sends edited players and keeps them locked through response and refresh", async () => {
  let finish;
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => new Promise((resolve) => { finish = resolve; }));
  const props = { draft: selectedDraft() };
  swapCards(subject, props);
  const request = buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
  const layout = JSON.parse(subject.requests[0].body).layout;
  assert.equal(layout[0].playerId, "synthetic-player-5");
  assert.equal(layout[5].playerId, "synthetic-player-0");
  for (const phase of ["response", "refresh"]) {
    const tree = subject.render(props);
    assert.equal(slot(tree, 0).props.draggable, false, phase);
    assert.equal(find(slot(tree, 0), (node) => node.type === "button").props.disabled, true, phase);
    assert.equal(find(tree, (node) => typeof node.props.href === "string" && node.props.href.includes("/matches/")), null, phase);
    swapCards(subject, props);
    assert.match(slot(subject.render(props), 0).props["aria-label"], /synthetic-player-5/u);
    if (phase === "response") { finish(mutationResult); await request; }
  }
  subject.finishTransitions();
  const current = { ...props.draft, revision: 2, selectedCandidateSignature: "manual-selected", candidates: [...props.draft.candidates, { ...props.draft.candidates[0], source: "MANUAL", criterion: "MANUAL", signature: "manual-selected", assignments: layout }] };
  const settled = subject.render({ draft: current });
  assert.equal(buttonNamed(settled, "선택 팀 저장").props.disabled, false);
  await buttonNamed(settled, "팀 결과 복사").props.onClick();
  assert.match(subject.clipboard[0], /^BLUE synthetic-player-5/u);
});

test("archived team drafts cannot be rearranged by keyboard or drag handlers", () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
  const props = { draft: selectedDraft("ARCHIVED"), mode: "ADMIN" };
  const tree = subject.render(props);
  assert.equal(slot(tree, 0).props.draggable, false);
  assert.equal(find(slot(tree, 0), (node) => node.type === "button").props.disabled, true);
  swapCards(subject, props);
  slot(subject.render(props), 5).props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => "0" } });
  assert.match(slot(subject.render(props), 0).props["aria-label"], /synthetic-player-0/u);
  assert.equal(subject.requests.length, 0);
});

test("failed manual evaluation preserves edited slots and retries the same revision and request key", async () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => ({ ok: false, json: async () => ({ detail: "합성 평가 실패 · 다시 시도" }) }));
  const props = { draft: selectedDraft() };
  swapCards(subject, props);
  await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
  const failed = subject.render(props);
  assert.match(slot(failed, 0).props["aria-label"], /synthetic-player-5/u);
  assert.equal(buttonNamed(failed, "선택 팀 저장").props.disabled, true);
  assert.equal(buttonNamed(failed, "수동 배치 평가·선택").props.disabled, false);
  assert.ok(find(failed, (node) => node.props.role === "status" && node.props.children === "합성 평가 실패 · 다시 시도"));
  await buttonNamed(failed, "수동 배치 평가·선택").props.onClick();
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(requestKey(subject.requests[0]), requestKey(subject.requests[1]));
  assert.equal(subject.requests[1].headers["If-Match"], '"1"');
  assert.deepEqual(subject.navigation, []);
});

test("single-role preferences remain in the request unless the user enables other roles for the initial search", async () => {
  const subject = harness(builderFile, "TeamBalanceBuilder", () => ({ ok: false, json: async () => ({ detail: "합성 입력 검사" }) }), true);
  await subject.render().props.onSubmit({ preventDefault() {} });
  const original = JSON.parse(subject.requests[0].body).participants;
  assert.deepEqual(original[0].eligiblePositions, [{ position: "TOP", preference: "MAIN" }]);
  assert.ok(original.every((participant) => participant.eligiblePositions.length === 1));
  find(subject.render(), (node) => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
  find(subject.render(), (node) => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  await subject.render().props.onSubmit({ preventDefault() {} });
  const optedIn = JSON.parse(subject.requests[1].body).participants;
  assert.deepEqual(optedIn[0].eligiblePositions, positions.map((position) => ({ position, preference: position === "TOP" ? "MAIN" : "AUTO" })));
  assert.deepEqual(optedIn[1].eligiblePositions, original[1].eligiblePositions, "one player's setting does not overwrite another player's preferences");
});

function relaxedDraft() {
  const draft = selectedDraft();
  draft.participants = draft.participants.map((participant, index) => ({ ...participant, displayName: `합성 선수 ${index + 1}` }));
  const reasons = [
    { code: "UNREGISTERED_POSITION", playerIds: ["synthetic-player-0"], position: "JGL", detail: "선택한 포지션 밖 정글 배정" },
    { code: "BOTTOM_TIER_GAP", playerIds: ["synthetic-player-3", "synthetic-player-8"], position: "ADC", detail: "원딜 현재 티어 3단계 차이" },
  ];
  draft.candidates[0].score.v1 = { formulaVersion, missingSources: [] };
  draft.candidates[0].score.fairness = { status: "REVIEW_REQUIRED", hardViolations: [], warnings: reasons.map(reason => reason.code === "UNREGISTERED_POSITION" ? `선수 ${reason.playerIds[0]}: ${reason.detail}` : reason.detail), checks: [{ code: "ALLOWED_POSITION_synthetic-player-0", label: "포지션 조건", status: "WARN", detail: "선수 synthetic-player-0: 선택한 포지션 밖 정글 배정" }],
    constraintRelaxation: { applied: true, roleDeviationCount: 1, bottomTierViolationCount: 1, reasons } };
  return draft;
}

test("relaxed server recommendations show named reasons and allow save, share and server-checked manual changes", async () => {
  const evaluations = [];
  const draft = relaxedDraft();
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult, false, (participants, layout, options) => {
    evaluations.push(options);
    assert.equal(options?.allowConstraintRelaxation, true);
    return { score: draft.candidates[0].score };
  });
  const props = { draft };
  let tree = subject.render(props);
  assert.equal(buttonNamed(tree, "선택 팀 저장").props.disabled, false);
  assert.equal(buttonNamed(tree, "팀 결과 복사").props.disabled, false);
  assert.ok(find(tree, node => typeof node.props.href === "string" && node.props.href.includes("/matches/")));
  assert.match(visibleText(tree), /조건 조정 편성/u);
  assert.match(visibleText(tree), /합성 선수 1 · 정글: 선택한 포지션 밖 정글 배정/u);
  assert.match(visibleText(tree), /합성 선수 4 · 합성 선수 9 · 원딜: 원딜 현재 티어 3단계 차이/u);
  assert.doesNotMatch(visibleText(tree), /synthetic-player/u);
  assert.equal(visibleText(tree).split("선택한 포지션 밖 정글 배정").length - 1, 2, "one summary reason and one expandable detailed check, without duplicate warnings");
  await buttonNamed(tree, "팀 결과 복사").props.onClick();
  assert.match(subject.clipboard[0], /내전 규칙: 조건 조정 편성/u);
  assert.match(subject.clipboard[0], /합성 선수 1 · 정글/u);
  assert.doesNotMatch(subject.clipboard[0], /synthetic-player/u);
  assert.equal(subject.clipboard[0].split("선택한 포지션 밖 정글 배정").length - 1, 1);
  find(slot(subject.render(props), 0), node => node.type === "button").props.onClick();
  find(slot(subject.render(props), 1), node => node.type === "button").props.onClick();
  tree = subject.render(props);
  assert.match(slot(tree, 0).props["aria-label"], /합성 선수 2/u);
  assert.match(visibleText(tree), /교체 후 조정되는 조건/u);
  assert.equal(evaluations.length, 1, "the evaluated relaxed preview is reused");
  await buttonNamed(tree, "수동 배치 평가·선택").props.onClick();
  assert.equal(JSON.parse(subject.requests[0].body).layout[0].playerId, "synthetic-player-1");
  assert.equal("allowConstraintRelaxation" in JSON.parse(subject.requests[0].body), false, "the server decides policy from the persisted draft");
});

test("only the current automatic recommendation can authorize relaxed manual swaps", () => {
  for (const variant of ["selected-manual-strict", "manual-marker-only", "old-auto-round"]) {
    const draft = relaxedDraft();
    if (variant === "selected-manual-strict") {
      draft.candidates.push({ ...selectedDraft().candidates[0], source: "MANUAL", signature: "manual-strict" });
      draft.selectedCandidateSignature = "manual-strict";
    } else if (variant === "manual-marker-only") draft.candidates[0].source = "MANUAL";
    else draft.candidates[0].evaluationRound = 0;
    let evaluated = 0;
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult, false, (_participants, _layout, options) => {
      evaluated++; assert.equal(options?.allowConstraintRelaxation, true); return { score: selectedDraft().candidates[0].score };
    });
    const props = { draft };
    find(slot(subject.render(props), 0), node => node.type === "button").props.onClick();
    find(slot(subject.render(props), 1), node => node.type === "button").props.onClick();
    assert.equal(evaluated, variant === "selected-manual-strict" ? 1 : 0);
  }
});

test("manual relaxed results describe the applied conditions without claiming an optimal automatic recommendation", () => {
  const draft = relaxedDraft();
  const automatic = draft.candidates[0];
  draft.candidates.push({ ...automatic, source: "MANUAL", rank: null, criterion: "MANUAL", signature: "manual-relaxed" });
  draft.selectedCandidateSignature = "manual-relaxed";
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
  const text = visibleText(subject.render({ draft }));
  assert.match(text, /수동 배치에 적용된 조정 조건/u);
  assert.match(text, /현재 수동 배치에서 포지션 1명/u);
  assert.doesNotMatch(text, /가능한 최선의 팀을 만들었어요|기존 조건을 모두 만족하는 조합이 없어/u);
  assert.match(share.formatTeamBalanceShareText(draft.candidates[1], draft.participants), /밸런스 판단: 수동 조정안/u);
});

test("conflict preservation validates manual slots under the latest automatic recommendation policy", async () => {
  for (const stillRelaxed of [true, false]) {
    const draft = relaxedDraft();
    const latest = { ...(stillRelaxed ? relaxedDraft() : selectedDraft()), revision: 2 };
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", attempt => attempt === 1
      ? { ok: false, status: 412, json: async () => ({}) } : { ok: true, json: async () => ({ draft: latest }) }, false,
      (_participants, _layout, options) => { if (!options?.allowConstraintRelaxation) throw new Error("unregistered position"); return { score: draft.candidates[0].score }; });
    const props = { draft };
    find(slot(subject.render(props), 0), node => node.type === "button").props.onClick();
    find(slot(subject.render(props), 1), node => node.type === "button").props.onClick();
    await buttonNamed(subject.render(props), "수동 배치 평가·선택").props.onClick();
    const tree = subject.render(props);
    assert.equal(Boolean(buttonNamed(tree, "내 수동 배치 유지")), stillRelaxed);
    assert.equal(buttonNamed(tree, "수동 배치 평가·선택").props.disabled, true);
    assert.match(slot(tree, 0).props["aria-label"], /합성 선수 2/u);
  }
});

test("keyboard and drag swaps preserve players when either role is not eligible", () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
  const props = { draft: selectedDraft() };
  find(slot(subject.render(props), 0), (node) => node.type === "button").props.onClick();
  find(slot(subject.render(props), 1), (node) => node.type === "button").props.onClick();
  assert.match(slot(subject.render(props), 0).props["aria-label"], /synthetic-player-0/u);
  assert.ok(find(subject.render(props), (node) => node.props.role === "status" && String(node.props.children).includes("허용하지 않은 포지션")));
  slot(subject.render(props), 1).props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => "0" } });
  assert.match(slot(subject.render(props), 1).props["aria-label"], /synthetic-player-1/u);
  assert.equal(subject.requests.length, 0);
});

test("a domain-rejected matchup leaves manual slots unchanged instead of announcing a successful swap", () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult, false, () => { throw new Error("FAIRNESS_CONSTRAINT"); });
  const props = { draft: selectedDraft() };
  swapCards(subject, props);
  assert.match(slot(subject.render(props), 0).props["aria-label"], /synthetic-player-0/u);
  assert.ok(find(subject.render(props), (node) => node.props.role === "status" && String(node.props.children).includes("큰 티어 3단계 제한")));
  assert.equal(find(subject.render(props), (node) => node.props.children === "수동 변경 · 평가 필요"), null);
});

test("invalid server reports block save, copying and match links; conditional reports remain explicit", async () => {
  for (const [status, label] of [["INVALID", "필수 조건 위반"], ["CONDITIONAL", "조건부 편성"], ["REVIEW_REQUIRED", "정보 확인 필요"]]) {
    const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
    const draft = selectedDraft();
    draft.candidates[0].score.v1 = { formulaVersion, missingSources: [] };
    draft.candidates[0].score.fairness = { status, hardViolations: status === "INVALID" ? ["합성 필수 제한 위반"] : [], warnings: [], checks: [] };
    const props = { draft };
    const tree = subject.render(props);
    assert.ok(find(tree, (node) => node.type === "strong" && node.props.children === label));
    assert.equal(buttonNamed(tree, "선택 팀 저장").props.disabled, status === "INVALID");
    if (status === "INVALID") {
      await buttonNamed(tree, "선택 팀 저장").props.onClick();
      await buttonNamed(tree, "팀 결과 복사").props.onClick();
      assert.equal(subject.requests.length, 0);
      assert.equal(subject.clipboard.length, 0);
      assert.equal(find(tree, (node) => typeof node.props.href === "string" && node.props.href.includes("/matches/")), null);
    }
  }
});

test("shared results retain fairness warnings and team scores without publishing an uncalibrated win probability", () => {
  const draft = selectedDraft();
  const candidate = draft.candidates[0];
  const legacy = share.formatTeamBalanceShareText(candidate, draft.participants);
  assert.match(legacy, /최신 기준 재평가 필요/u);
  assert.match(legacy, /점수 차이는 실제 승률을 뜻하지 않습니다/u);
  assert.match(legacy, /팀 점수: RED 250\.0 \/ BLUE 250\.0 \/ 차이 0\.0/u);
  assert.doesNotMatch(legacy, /\d+(?:\.\d+)?%/u);
  candidate.score.fairness = { status: "CONDITIONAL", hardViolations: [], warnings: ["큰 대면 격차가 두 곳입니다."], checks: [] };
  candidate.score.v1 = { formulaVersion, missingSources: [], predictedRedWinRate: 90.9, predictedBlueWinRate: 9.1 };
  const current = share.formatTeamBalanceShareText(candidate, draft.participants);
  assert.match(current, /내전 규칙: 조건부 편성/u);
  assert.match(current, /큰 대면 격차가 두 곳입니다/u);
  assert.doesNotMatch(current, /90\.9|9\.1|%/u);
  assert.equal(candidate.score.v1.predictedRedWinRate, 90.9, "legacy score fields are preserved");
});

function visibleText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(visibleText).join("");
}

test("manual swap previews show before and after team totals once and label the unchanged applied report", () => {
  let evaluations = 0;
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult, false, () => {
    evaluations += 1;
    return { score: { teamStrength: { redTotal: 270, blueTotal: 230, difference: 40 } } };
  });
  const props = { draft: selectedDraft() };
  props.draft.candidates[0].score.v1 = { formulaVersion, missingSources: [], predictedRedWinRate: 90.9, predictedBlueWinRate: 9.1 };
  swapCards(subject, props);
  const tree = subject.render(props);
  const preview = find(tree, (node) => node.props["aria-label"] === "수동 변경 점수 미리보기");
  assert.ok(preview);
  assert.match(visibleText(preview), /250\.0 → 270\.0/u);
  assert.match(visibleText(preview), /250\.0 → 230\.0/u);
  assert.match(visibleText(preview), /0\.0 → 40\.0/u);
  assert.match(visibleText(tree), /적용 전 배치 기준/u);
  assert.match(visibleText(tree), /미리보기 · 서버 평가 후 적용/u);
  assert.doesNotMatch(visibleText(tree), /90\.9|9\.1|예상 승률/u);
  subject.render(props);
  assert.equal(evaluations, 1, "the successful hard-rule check is reused for the preview");
  assert.equal(subject.requests.length, 0, "the preview does not apply the layout to the server");
});

test("older fairness reports still require reevaluation under the current ordered rules", () => {
  const subject = harness(workspaceFile, "TeamBalanceDraftWorkspace", () => mutationResult);
  const draft = selectedDraft();
  const candidate = draft.candidates[0];
  candidate.score.fairness = { status: "BALANCED", hardViolations: [], warnings: [], checks: [] };
  candidate.score.v1 = { formulaVersion: "V2_INHOUSE_FAIRNESS_2026_10_15", missingSources: [] };
  const text = visibleText(subject.render({ draft }));
  assert.match(text, /최신 기준 재평가 필요/u);
  assert.match(text, /최신 자동 조정 기준으로 재평가/u);
  assert.doesNotMatch(text, /균형 추천/u);
  assert.match(share.formatTeamBalanceShareText(candidate, draft.participants), /최신 자동 조정 기준으로 재평가/u);
});
