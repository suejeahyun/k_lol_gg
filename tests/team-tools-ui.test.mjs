import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("랜덤 팀 화면은 도메인 계산과 입력·빈·오류·결과·복사·초기화 상태를 연결한다", () => {
  const client = source("../src/app/(public)/(tools)/tools/random-team/random-team-tool.tsx");

  for (const contract of [
    "parseRandomTeamInput",
    "createRandomTeams",
    "createTierBalancedTeams",
    "tierScore",
    'role="alert"',
    'role="status"',
    'aria-live="polite"',
    "navigator.clipboard.writeText",
    "초기화",
    "아직 만든 팀이 없어요",
  ]) {
    assert.equal(client.includes(contract), true, contract);
  }
  assert.equal(/Math\.random|\.sort\(\s*\(\)\s*=>/u.test(client), false);
  assert.equal(client.includes('teamText("1팀"'), true);
  assert.equal(client.includes('teamText("2팀"'), true);
  assert.equal(client.includes("하늘 팀"), false);
  assert.equal(client.includes("꽃잎 팀"), false);
});

test("코인 토스 화면은 상태머신과 animation/fallback 공개 경로를 함께 둔다", () => {
  const client = source("../src/app/(public)/(tools)/tools/coin-toss/coin-toss-tool.tsx");
  const styles = source("../src/app/(public)/(tools)/tools/team-tools.module.css");

  for (const contract of [
    "INITIAL_COIN_TOSS_STATE",
    "beginCoinToss",
    "revealCoinToss",
    "transitionCoinToss",
    "FALLBACK_REVEAL_MS",
    "onAnimationEnd",
    'aria-live="polite"',
    "navigator.clipboard.writeText",
    "초기화",
  ]) {
    assert.equal(client.includes(contract), true, contract);
  }
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(styles, /\.coin\[data-phase="playing"\]/u);
  assert.equal(client.includes("Math.random"), false);
});

test("공개 도구 페이지에는 상호 이동과 canonical metadata가 있다", () => {
  const randomPage = source("../src/app/(public)/(tools)/tools/random-team/page.tsx");
  const coinPage = source("../src/app/(public)/(tools)/tools/coin-toss/page.tsx");
  const balancePage = source("../src/app/(public)/(tools)/tools/team-balance/page.tsx");
  const draftsPage = source("../src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx");
  const navigation = source("../src/app/(public)/(tools)/tools/team-tool-nav.tsx");

  for (const page of [randomPage, coinPage, balancePage, draftsPage]) {
    assert.equal(page.includes("TeamToolNav"), true);
  }
  for (const href of ["/tools/team-balance", "/tools/random-team", "/tools/coin-toss", "/tools/team-balance/drafts"]) {
    assert.equal(navigation.includes(`href="${href}"`), true, href);
  }
  for (const page of [randomPage, coinPage, balancePage]) {
    assert.equal(page.includes("alternates: { canonical:"), true);
  }
  assert.equal(navigation.includes('aria-label="팀 도구"'), true);
  assert.equal(navigation.includes('aria-current='), true);
});

test("팀 밸런스 화면은 승인 계정, 10명 입력, top3·수동·저장·재평가 수명주기를 연결한다", () => {
  const page = source("../src/app/(public)/(tools)/tools/team-balance/page.tsx");
  const drafts = source("../src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx");
  const builder = source("../src/app/(public)/(tools)/tools/team-balance/team-balance-builder.tsx");
  const detail = source("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx");

  for (const contract of [
    "getCurrentSession",
    "accountStatus",
    "TeamToolNav",
    "TeamBalanceBuilder",
    'role="status"',
    'href="/login?next=%2Ftools%2Fteam-balance"',
  ]) {
    assert.equal(page.includes(contract), true, contract);
  }
  for (const contract of [
    "Array.from({ length: 10 }",
    "/api/team-tools/candidates?source=season",
    "/api/team-tools/candidates?source=players",
    'value="KAKAO"',
    'value="SITE"',
    "selectedIds.has",
    "SingleChoice",
    'aria-pressed={row.allPositions}',
    'aria-label="추가 가능 포지션"',
    'aria-expanded={stepOneOpen}',
    'aria-expanded={stepTwoOpen}',
    'fetch("/api/team-tools/drafts"',
    '"If-Match"',
    '"Idempotency-Key"',
    'role="alert"',
    "상위 3개 계산",
    "입력 초기화",
  ]) {
    assert.equal(builder.includes(contract), true, contract);
  }
  for (const contract of [
    "candidate.score.totalPenalty",
    'mutate("select"',
    'mutate("save"',
    'mutate("reevaluate"',
    'aria-live="polite"',
    "수동 배치 평가·선택",
    "manualTeams",
    "onDragStart",
    "data-drop-target",
    "selectKeyboardSlot",
    "/matches/submit?teamBalanceDraftId=",
  ]) {
    assert.equal(detail.includes(contract), true, contract);
  }
  assert.equal(detail.includes("compactTeams"), false, "1·2·3안의 블루/레드 사진형 미리보기를 제거한다");
  for (const contract of [
    "requireApprovedAccountPage",
    "service.listDrafts",
    "participantCount",
    'aria-label="팀 밸런스 초안 페이지"',
    'role="alert"',
    'role="status"',
  ]) {
    assert.equal(drafts.includes(contract), true, contract);
  }
});

test("팀 밸런스 후보 API는 승인 계정과 안전한 서버 검색·신청 그룹 경계를 사용한다", () => {
  const route = source("../src/app/api/team-tools/candidates/route.ts");
  const repository = source("../src/modules/team-tools/infrastructure/postgres-team-balance-candidate-repository.ts");

  for (const contract of [
    'requireTeamBalanceApiSession("USER", request)',
    "parseTeamBalanceCandidateQuery",
    "repository.searchPlayers",
    "repository.listSeasonGroups",
    "teamBalanceReadResponse",
    "teamBalanceUnavailableResponse",
  ]) {
    assert.equal(route.includes(contract), true, contract);
  }
  for (const contract of [
    "players.memberName",
    "players.nickname",
    "players.memberNameNormalized",
    "MAXIMUM_PLAYER_RESULTS + 1",
    'eq(players.status, "ACTIVE")',
    'inArray(seasonApplications.status, ["APPLIED", "CONFIRMED"])',
    'input.origin === "ALL"',
    "MAXIMUM_CANDIDATES + 1",
  ]) {
    assert.equal(repository.includes(contract), true, contract);
  }
});
