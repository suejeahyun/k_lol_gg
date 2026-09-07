import assert from "node:assert/strict";
import test from "node:test";

import { parseTeamBalanceDraftListQuery } from "../src/modules/team-tools/infrastructure/team-balance-query";

test("팀 밸런스 초안 목록 query는 단일·제한된 페이지 값만 허용한다", () => {
  assert.deepEqual(parseTeamBalanceDraftListQuery("https://v2.invalid/tools/team-balance/drafts"), {
    page: 1,
    pageSize: 12,
  });
  assert.deepEqual(parseTeamBalanceDraftListQuery("https://v2.invalid/tools/team-balance/drafts?page=3&pageSize=25"), {
    page: 3,
    pageSize: 25,
  });
  for (const url of [
    "https://v2.invalid/tools/team-balance/drafts?page=0",
    "https://v2.invalid/tools/team-balance/drafts?page=101",
    "https://v2.invalid/tools/team-balance/drafts?pageSize=51",
    "https://v2.invalid/tools/team-balance/drafts?page=1&page=2",
    "https://v2.invalid/tools/team-balance/drafts?owner=someone",
  ]) {
    assert.equal(parseTeamBalanceDraftListQuery(url), null, url);
  }
});
