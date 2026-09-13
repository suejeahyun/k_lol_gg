import assert from "node:assert/strict";
import test from "node:test";

import { createGetPlayerProfile } from "../src/modules/players/application/get-player-profile";
import { createListPlayers } from "../src/modules/players/application/list-players";
import { parsePlayerCatalogQuery } from "../src/modules/players/application/parse-player-catalog-query";
import { fixturePlayerRepository } from "../src/modules/players/infrastructure/fixture-player-repository";
import {
  formatPlayerTierEditValue,
  parsePlayerTierFilter,
  playerDivisionTierOptions,
  playerMasterPlusTierOptions,
  playerTierEditState,
  playerTierFamily,
} from "../src/modules/players/domain/player-tier";
import {
  buildLegacyHomeDestination,
  buildLegacyPlayersDestination,
} from "../src/modules/navigation/application/legacy-player-redirects";

test("플레이어 목록 query는 검색어·페이지 길이와 범위를 제한한다", () => {
  assert.deepEqual(parsePlayerCatalogQuery({}), { query: "", tier: null, page: 1, pageSize: 12 });
  assert.deepEqual(parsePlayerCatalogQuery({ q: ["  SkyFox#V2 ", "ignored"], tier: "emerald", page: "2" }), {
    query: "SkyFox#V2",
    tier: "EMERALD",
    page: 2,
    pageSize: 12,
  });
  assert.equal(parsePlayerCatalogQuery({ q: "가".repeat(120), page: "10001" }).query.length, 80);
  assert.equal(parsePlayerCatalogQuery({ page: "-1" }).page, 1);
});

test("티어 query는 허용 목록만 받고 영문·한글 티어 표기를 같은 계열로 묶는다", () => {
  assert.equal(parsePlayerTierFilter(" platinum "), "PLATINUM");
  assert.equal(parsePlayerTierFilter("UNRANKED"), null);
  assert.equal(playerTierFamily("PLATINUM IV"), "PLATINUM");
  assert.equal(playerTierFamily("플래티넘 2"), "PLATINUM");
  assert.equal(playerTierFamily(null), null);
});

test("내정보 티어 선택값은 다이아 이하 4단계와 마스터 이상 점수 입력 계약을 보존한다", () => {
  assert.equal(playerDivisionTierOptions.length, 7 * 4);
  assert.deepEqual(playerDivisionTierOptions[0], { value: "IRON IV", label: "아이언 4" });
  assert.deepEqual(playerDivisionTierOptions.at(-1), { value: "DIAMOND I", label: "다이아몬드 1" });
  assert.deepEqual(playerMasterPlusTierOptions.map((tier) => tier.value), ["MASTER", "GRANDMASTER", "CHALLENGER"]);

  assert.deepEqual(playerTierEditState("골드 2"), { tier: "GOLD II", score: "" });
  assert.deepEqual(playerTierEditState("DIAMOND IV"), { tier: "DIAMOND IV", score: "" });
  assert.deepEqual(playerTierEditState("마스터 3층"), { tier: "MASTER", score: "3" });
  assert.deepEqual(playerTierEditState("MASTER 0"), { tier: "MASTER", score: "0" });
  assert.deepEqual(playerTierEditState("그랜드마스터 450"), { tier: "GRANDMASTER", score: "450" });
  assert.deepEqual(playerTierEditState("CHALLENGER 9999"), { tier: "CHALLENGER", score: "9999" });

  assert.equal(formatPlayerTierEditValue("EMERALD III", ""), "EMERALD III");
  assert.equal(formatPlayerTierEditValue("MASTER", "0"), "MASTER 0");
  assert.equal(formatPlayerTierEditValue("MASTER", "0007"), "MASTER 7");
  assert.equal(formatPlayerTierEditValue("GRANDMASTER", "450"), "GRANDMASTER 450");
  assert.equal(formatPlayerTierEditValue("CHALLENGER", "9999"), "CHALLENGER 9999");
  assert.equal(formatPlayerTierEditValue("MASTER", ""), undefined);
  assert.equal(formatPlayerTierEditValue("MASTER", "10000"), undefined);
});

test("목록·상세 유스케이스는 repository port를 통해 pagination과 404 계약을 지킨다", async () => {
  const listPlayers = createListPlayers(fixturePlayerRepository);
  const page = await listPlayers({ query: "", tier: null, page: 2, pageSize: 2 });
  assert.equal(page.totalCount, 4);
  assert.equal(page.currentPage, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items.length, 2);

  const getProfile = createGetPlayerProfile(fixturePlayerRepository);
  assert.equal((await getProfile("fixture-sky-fox"))?.displayName, "하늘여우");
  assert.equal(await getProfile("missing"), null);
});

test("fixture 목록도 회원명 검색과 티어 필터를 함께 적용하되 회원명은 반환하지 않는다", async () => {
  const byMemberName = await fixturePlayerRepository.getCatalog({
    query: "김하늘",
    tier: "PLATINUM",
    page: 1,
    pageSize: 12,
  });
  assert.deepEqual(byMemberName.items.map((player) => player.id), ["fixture-sky-fox"]);
  assert.equal(JSON.stringify(byMemberName).includes("김하늘"), false);
  const emerald = await fixturePlayerRepository.getCatalog({ query: "", tier: "EMERALD", page: 1, pageSize: 12 });
  assert.deepEqual(emerald.items.map((player) => player.id), ["fixture-lilac-star"]);
});

test("공개 플레이어 projection에는 금지된 회원·계정·Discord·내부 보정 필드가 없다", async () => {
  const page = await fixturePlayerRepository.getCatalog({ query: "", tier: null, page: 1, pageSize: 12 });
  const serialized = JSON.stringify(page);

  for (const forbidden of [
    "memberName",
    "userAccountId",
    "loginId",
    "discord",
    "balanceOverrideReason",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("두 legacy redirect는 route별 query allowlist만 보존한다", () => {
  assert.equal(buildLegacyHomeDestination({ source: "pwa", token: "drop-me" }), "/?source=pwa");
  assert.equal(buildLegacyHomeDestination({ source: "web", next: "//evil.example" }), "/");
  assert.equal(
    buildLegacyPlayersDestination({
      q: ["  Sky Fox#V2  ", "ignored"],
      page: "2",
      token: "drop-me",
      next: "https://evil.example",
    }),
    "/players?q=Sky+Fox%23V2&page=2",
  );
});
