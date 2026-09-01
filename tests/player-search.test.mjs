import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlayerQuery } from "../src/modules/players/application/normalize-player-query.ts";
import { createSearchPlayers } from "../src/modules/players/application/search-players.ts";

test("플레이어 검색어는 문자열·배열·미입력을 하나의 안전한 문자열로 정규화한다", () => {
  assert.equal(normalizePlayerQuery(undefined), "");
  assert.equal(normalizePlayerQuery("  하늘여우  "), "하늘여우");
  assert.equal(normalizePlayerQuery(["첫번째", "두번째"]), "첫번째");
  assert.equal(normalizePlayerQuery([]), "");
});

test("중복 q 파라미터 배열은 첫 값으로 정규화되어 trim 오류를 만들지 않는다", () => {
  const duplicatedQuery = ["  SkyFox#V2 ", "ignored"];

  assert.doesNotThrow(() => normalizePlayerQuery(duplicatedQuery));
  assert.equal(normalizePlayerQuery(duplicatedQuery), "SkyFox#V2");
});

test("검색 유스케이스는 PlayerRepository 포트를 통해 주입된 구현만 호출한다", async () => {
  const calls = [];
  const repository = {
    async search(query) {
      calls.push(query);
      return [];
    },
  };

  const searchPlayers = createSearchPlayers(repository);
  const result = await searchPlayers("라일락별");

  assert.deepEqual(calls, ["라일락별"]);
  assert.deepEqual(result, []);
});
