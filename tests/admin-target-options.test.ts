import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminTargetOptionQuery } from "../src/modules/players/application/parse-admin-target-option-query";

const playerId = "00000000-0000-4000-8000-000000000101";

test("관리자 대상 선택기 검색은 bounded query와 선택 유지 ID만 허용한다", () => {
  assert.deepEqual(parseAdminTargetOptionQuery("https://example.test/api/admin/discipline-records/target-options?q=%20%EC%95%84%EB%A6%AC%20"), { query: "아리", include: null });
  assert.deepEqual(parseAdminTargetOptionQuery(`https://example.test/api/admin/discipline-records/target-options?q=Ahri&include=PLAYER:${playerId.toUpperCase()}`), {
    query: "Ahri",
    include: { kind: "player", id: playerId },
  });
});

test("관리자 대상 선택기는 짧은·중복·미허용·bidi·잘못된 include를 거부한다", () => {
  for (const url of [
    "https://example.test/api/admin/discipline-records/target-options?q=a",
    "https://example.test/api/admin/discipline-records/target-options?q=aa&q=bb",
    "https://example.test/api/admin/discipline-records/target-options?q=aa&role=ADMIN",
    "https://example.test/api/admin/discipline-records/target-options?q=%E2%80%AEbad",
    "https://example.test/api/admin/discipline-records/target-options?q=Ahri&include=player:not-a-uuid",
  ]) assert.equal(parseAdminTargetOptionQuery(url), null, url);
});
