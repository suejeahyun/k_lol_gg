import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("홈과 데스크톱 메뉴는 이미 구현된 경기·팀 밸런스를 준비 중으로 표시하지 않는다", () => {
  const home = source("../src/app/(public)/(home)/page.tsx");
  const navigation = source("../src/components/navigation/user-site-navigation.tsx");
  assert.equal(home.includes('href: "/matches"'), true);
  assert.equal(home.includes('href: "/tools/team-balance"'), true);
  assert.equal(home.includes('title: "경기 살펴보기",\n    description: "시즌·기간별 경기와 세트 기록을 한 흐름으로 준비합니다."'), false);
  assert.equal(navigation.includes('aria-label="경기 기능 준비 중"'), false);
  assert.equal(navigation.includes("<Swords"), true);
});

test("홈 공개 집계는 활성 플레이어·시즌과 게시 경기만 센다", () => {
  const repository = source("../src/modules/home/infrastructure/postgres-home-repository.ts");
  for (const contract of [
    'eq(players.status, "ACTIVE")',
    'eq(seasons.status, "ACTIVE")',
    'eq(matchSeries.status, "PUBLISHED")',
    "activeSeasonCount",
    "publishedMatchCount",
  ]) assert.equal(repository.includes(contract), true, contract);
});

test("홈 공개 피드는 실제 구인·대회·홈 갤러리를 조회하고 준비됨으로 꾸미지 않는다", () => {
  const repository = source("../src/modules/home/infrastructure/postgres-home-repository.ts");
  const domain = source("../src/modules/home/domain/home-snapshot.ts");
  const home = source("../src/app/(public)/(home)/page.tsx");
  for (const table of ["recruitParties", "scrimRecruits", "eventCompetitions", "destructionCompetitions", "mediaGalleries"]) {
    assert.equal(repository.includes(table), true, table);
  }
  assert.equal(repository.includes('eq(mediaGalleries.status, "PUBLISHED")'), true);
  assert.equal(repository.includes("eq(mediaGalleries.showOnHome, true)"), true);
  assert.equal(domain.includes('"not-implemented"'), false);
  assert.equal(home.includes('data-state="ready">커뮤니티'), false);
  assert.equal(home.includes("snapshot.feeds.recentMatches"), true);
  assert.equal(home.includes("snapshot.feeds.recruits"), true);
  assert.equal(home.includes("snapshot.feeds.competitions"), true);
  assert.equal(home.includes("snapshot.feeds.gallery"), true);
});

test("홈 피드 공개 projection은 소유자·회원·Discord 필드를 선택하지 않는다", () => {
  const repository = source("../src/modules/home/infrastructure/postgres-home-repository.ts");
  for (const privateSelection of ["memberName:", "loginId:", "ownerUserAccountId:", "discordId:"]) {
    assert.equal(repository.includes(privateSelection), false, privateSelection);
  }
});

test("홈은 DB 전체 활성 챔피언의 KST 일일 선택과 공개 현재 랭킹을 표시한다", () => {
  const runtime = source("../src/modules/home/infrastructure/runtime-home-data.ts");
  const domain = source("../src/modules/home/domain/home-snapshot.ts");
  const home = source("../src/app/(public)/(home)/page.tsx");
  assert.match(runtime, /service\.listPublic\(\{ query: null, status: "ACTIVE"/);
  assert.match(runtime, /Math\.ceil\(firstPage\.total \/ pageSize\)/);
  assert.match(domain, /timeZone: "Asia\/Seoul"/);
  assert.match(home, /우리 같이/);
  assert.match(home, /롤하자~/);
  assert.match(home, /getPublicSeasonRanking\(null, 10\)/);
  assert.match(home, /className="home-ranking-table"/);
  assert.match(home, /ChampionPortrait/);
});

test("홈과 플레이어 찾기는 회원명 검색을 안내하되 회원명을 결과로 출력하지 않는다", () => {
  const home = source("../src/app/(public)/(home)/page.tsx");
  const playerPage = source("../src/app/(public)/(registry)/players/page.tsx");
  const playerRepository = source("../src/modules/players/infrastructure/postgres-player-repository.ts");
  assert.match(home, /회원명, 닉네임 또는 GameName#TAG/);
  assert.match(playerPage, /회원명·닉네임 또는 Riot ID/);
  assert.match(playerPage, /player-tier-filters/);
  assert.match(playerRepository, /players\.memberNameNormalized/);
  assert.doesNotMatch(playerPage, /player\.memberName/);
});
