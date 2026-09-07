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

  for (const page of [randomPage, coinPage]) {
    assert.equal(page.includes('href="/tools/random-team"'), true);
    assert.equal(page.includes('href="/tools/coin-toss"'), true);
    assert.equal(page.includes("alternates: { canonical:"), true);
  }
});
