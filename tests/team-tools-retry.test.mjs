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
const formulaVersion = "V2_INHOUSE_PRIORITY_2026_10_15";
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

test("a single selected role stays locked until the participant explicitly allows autofill", async () => {
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
  assert.deepEqual(optedIn[1].eligiblePositions, original[1].eligiblePositions, "one player's consent does not unlock another player's roles");
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
  assert.match(text, /최신 1→6 우선순위가 적용되지 않았습니다/u);
  assert.doesNotMatch(text, /균형 추천/u);
  assert.match(share.formatTeamBalanceShareText(candidate, draft.participants), /최신 1→6 우선순위가 적용되지 않은 결과/u);
});
