import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildHomePublicRankingSummaries, buildPublicRankingView, isPublicRankingView, publicRankingViewDefinitions } from "../src/modules/statistics/domain/public-ranking-view";

const rows = [
  { playerId: "b", displayName: "B", riotId: "B#KR1", rank: 1, totalGames: 12, participationCount: 12, wins: 9, losses: 3, winRate: 80, kda: 2, mvpCount: 1 },
  { playerId: "a", displayName: "A", riotId: "A#KR1", rank: 2, totalGames: 12, participationCount: 12, wins: 9, losses: 3, winRate: 80, kda: 2, mvpCount: 3 },
  { playerId: "c", displayName: "C", riotId: "C#KR1", rank: 3, totalGames: 15, participationCount: 15, wins: 10, losses: 5, winRate: 70, kda: 2, mvpCount: 2 },
  { playerId: "d", displayName: "D", riotId: "D#KR1", rank: 4, totalGames: 15, participationCount: 15, wins: 9, losses: 6, winRate: 60, kda: 2, mvpCount: 4 },
  { playerId: "e", displayName: "E", riotId: "E#KR1", rank: 5, totalGames: 15, participationCount: 15, wins: 10, losses: 5, winRate: 70, kda: 2, mvpCount: 2 },
] as const;

test("공개 랭킹 세 분류는 명시된 동률 규칙으로 독립 정렬되고 원본을 바꾸지 않는다", () => {
  assert.deepEqual(buildPublicRankingView(rows, "win-rate").map((row) => row.playerId), ["a", "b", "c", "e", "d"]);
  assert.deepEqual(buildPublicRankingView(rows, "participation").map((row) => row.playerId), ["d", "c", "e", "a", "b"]);
  assert.deepEqual(buildPublicRankingView(rows, "mvp").map((row) => row.playerId), ["d", "a", "c", "e", "b"]);
  assert.deepEqual(rows.map((row) => row.playerId), ["b", "a", "c", "d", "e"]);
});

test("홈 Top 3은 상세 탭과 같은 공개 정렬 계약을 사용한다", () => {
  const summaries = buildHomePublicRankingSummaries(rows);
  for (const view of publicRankingViewDefinitions) {
    assert.deepEqual(summaries.find((summary) => summary.id === view.id)?.rows, buildPublicRankingView(rows, view.id).slice(0, 3));
  }
});

test("표시 승률이 66.7%로 같아도 667/1000은 2/3보다 정확히 앞선다", () => {
  const boundaryRows = [
    { ...rows[0], playerId: "two-thirds", totalGames: 3, wins: 2, losses: 1, winRate: 66.7 },
    { ...rows[1], playerId: "six-six-seven", totalGames: 1000, wins: 667, losses: 333, winRate: 66.7 },
  ];
  assert.deepEqual(buildPublicRankingView(boundaryRows, "win-rate").map((row) => row.playerId), ["six-six-seven", "two-thirds"]);
  assert.deepEqual(buildHomePublicRankingSummaries(boundaryRows)[0]?.rows.map((row) => row.playerId), ["six-six-seven", "two-thirds"]);
});

test("랭킹 분류 파서는 허용된 공개 뷰만 통과시킨다", () => {
  assert.equal(isPublicRankingView("win-rate"), true);
  assert.equal(isPublicRankingView("participation"), true);
  assert.equal(isPublicRankingView("mvp"), true);
  assert.equal(isPublicRankingView("mmr"), false);
  assert.equal(isPublicRankingView(["win-rate"]), false);
});

test("랭킹 화면은 세 분류, 상태 안내, MMR 진입과 모바일 44px 계약을 제공한다", () => {
  const page = readFileSync(new URL("../src/app/(public)/(statistics)/rankings/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/app/(public)/(statistics)/rankings/rankings.module.css", import.meta.url), "utf8");
  assert.match(page, /aria-label="랭킹 분류"/);
  assert.match(page, /name="view" value=\{requestedView\}/);
  assert.match(page, /href="\/rankings\/mmr"/);
  assert.match(page, /랭킹 기준을 충족한 플레이어가 없어요/);
  assert.match(page, /이 시즌 통계를 준비하고 있어요/);
  assert.match(page, /랭킹을 불러오지 못했어요/);
  assert.match(styles, /\.tabs a\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /\.board li a\s*\{[\s\S]*?min-height:\s*44px/);
});
