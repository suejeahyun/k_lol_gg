import assert from "node:assert/strict";
import test from "node:test";

import { createGetPlayerProfile } from "../src/modules/players/application/get-player-profile";
import { createListPlayers } from "../src/modules/players/application/list-players";
import { parsePlayerCatalogQuery } from "../src/modules/players/application/parse-player-catalog-query";
import { fixturePlayerRepository } from "../src/modules/players/infrastructure/fixture-player-repository";
import {
  buildLegacyHomeDestination,
  buildLegacyPlayersDestination,
} from "../src/modules/navigation/application/legacy-player-redirects";

test("플레이어 목록 query는 검색어·페이지 길이와 범위를 제한한다", () => {
  assert.deepEqual(parsePlayerCatalogQuery({}), { query: "", page: 1, pageSize: 12 });
  assert.deepEqual(parsePlayerCatalogQuery({ q: ["  SkyFox#V2 ", "ignored"], page: "2" }), {
    query: "SkyFox#V2",
    page: 2,
    pageSize: 12,
  });
  assert.equal(parsePlayerCatalogQuery({ q: "가".repeat(120), page: "10001" }).query.length, 80);
  assert.equal(parsePlayerCatalogQuery({ page: "-1" }).page, 1);
});

test("목록·상세 유스케이스는 repository port를 통해 pagination과 404 계약을 지킨다", async () => {
  const listPlayers = createListPlayers(fixturePlayerRepository);
  const page = await listPlayers({ query: "", page: 2, pageSize: 2 });
  assert.equal(page.totalCount, 4);
  assert.equal(page.currentPage, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items.length, 2);

  const getProfile = createGetPlayerProfile(fixturePlayerRepository);
  assert.equal((await getProfile("fixture-sky-fox"))?.displayName, "하늘여우");
  assert.equal(await getProfile("missing"), null);
});

test("공개 플레이어 projection에는 금지된 회원·계정·Discord·내부 보정 필드가 없다", async () => {
  const page = await fixturePlayerRepository.getCatalog({ query: "", page: 1, pageSize: 12 });
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
