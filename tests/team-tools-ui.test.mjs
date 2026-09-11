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

test("팀 밸런스 화면은 승인 계정, 10명 입력, V1 단일 추천·공유·수동·저장·재평가 수명주기를 연결한다", () => {
  const page = source("../src/app/(public)/(tools)/tools/team-balance/page.tsx");
  const drafts = source("../src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx");
  const builder = source("../src/app/(public)/(tools)/tools/team-balance/team-balance-builder.tsx");
  const detail = source("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/team-balance-draft-workspace.tsx");
  const detailPage = source("../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/page.tsx");
  const navigation = source("../src/app/(public)/(tools)/tools/team-tool-nav.tsx");
  const submission = source("../src/app/(public)/(matches)/matches/submit/submission-form.tsx");

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
    'className={styles.mainPositionButtons}',
    'aria-label={`${row.playerLabel} 주 포지션`}',
    'aria-label="추가 가능 포지션"',
    'aria-expanded={stepOneOpen}',
    'aria-expanded={stepTwoOpen}',
    'fetch("/api/team-tools/drafts"',
    '"If-Match"',
    '"Idempotency-Key"',
    'role="alert"',
    "V1 추천 계산",
    "입력 초기화",
  ]) {
    assert.equal(builder.includes(contract), true, contract);
  }
  for (const contract of [
    "V1 AI GLOBAL · ONE RESULT",
    "V1 기준 추천 결과",
    "selectedCandidate.score.v1?.recommendationScore",
    "V1 전체탐색 추천",
    "현재 선택 기준",
    "V1 기준으로 재평가",
    "formatTeamBalanceShareText",
    "navigator.clipboard.writeText",
    "팀 결과 복사",
    'mutate("select"',
    'mutate("save"',
    'mutate("reevaluate"',
    'aria-live="polite"',
    "수동 배치 평가·선택",
    "manualTeams",
    "onDragStart",
    "data-drop-target",
    "manualPlayerInfo",
    "selectKeyboardSlot",
    "/matches/submit?teamBalanceDraftId=",
  ]) {
    assert.equal(detail.includes(contract), true, contract);
  }
  assert.equal(detail.includes("AUTO OPTIONS · TOP 3"), false, "기존 TOP 3 비교 표시는 노출하지 않는다");
  assert.equal(detail.includes("자동 추천 후보 비교"), false, "기존 세 후보 비교 제목은 노출하지 않는다");
  assert.equal(detail.includes("compactTeams"), false, "1·2·3안의 블루/레드 사진형 미리보기를 제거한다");
  assert.equal(detail.includes("<select"), false, "수동 배치에는 플레이어 드롭다운을 표시하지 않는다");
  assert.equal(page.includes("V1 기준의 가장 균형 잡힌 배치 한 가지"), true, "시작 화면은 단일 추천을 안내한다");
  assert.equal(drafts.includes('title: "팀 밸런스 초안"'), true, "목록 metadata는 공용 운영 명칭을 사용한다");
  assert.equal(drafts.includes('"팀 밸런스 초안"}</h1>'), true, "목록 제목은 공용 운영 명칭을 사용한다");
  assert.equal(navigation.includes("팀 밸런스 초안"), true, "팀 도구 메뉴는 개인 소유 명칭을 사용하지 않는다");
  assert.equal(detailPage.includes("초안 목록"), true, "상세 화면은 공용 초안 목록으로 돌아간다");
  assert.equal(detail.includes("드래그해 교체"), true, "수동 카드에 현재 교체 동작을 안내한다");
  assert.equal(detail.includes("교체할 카드 선택"), true, "키보드 교체 버튼은 선택 대상을 설명한다");
  assert.equal(submission.includes("현재 적용된 최신 팀 배치"), true, "결과 접수는 적용된 배치를 안내한다");
  const currentTeamBalanceCopy = [page, drafts, builder, detail, detailPage, navigation, submission].join("\n");
  for (const legacyCopy of ["내 팀 밸런스 초안", "내 초안", "가장 균형 잡힌 세 가지", "팀 후보를 계산", "팀 후보를 선택", "교체 시작", "끌어서 이동"]) {
    assert.equal(currentTeamBalanceCopy.includes(legacyCopy), false, `과거 문구 제거: ${legacyCopy}`);
  }
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
