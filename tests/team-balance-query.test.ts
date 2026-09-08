import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTeamBalanceCandidateQuery,
  parseTeamBalanceDraftListQuery,
} from "../src/modules/team-tools/infrastructure/team-balance-query";

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

test("팀 밸런스 후보 query는 플레이어 검색과 최근 신청 출처만 허용한다", () => {
  assert.deepEqual(
    parseTeamBalanceCandidateQuery("https://v2.invalid/api/team-tools/candidates?source=players&q=%20%EA%B0%80%20%20%EB%82%98%20"),
    { source: "players", query: "가 나" },
  );
  assert.deepEqual(
    parseTeamBalanceCandidateQuery("https://v2.invalid/api/team-tools/candidates?source=season&origin=kakao&days=7"),
    { source: "season", origin: "KAKAO", days: 7 },
  );
  assert.deepEqual(
    parseTeamBalanceCandidateQuery("https://v2.invalid/api/team-tools/candidates?source=season"),
    { source: "season", origin: "ALL", days: 3 },
  );
  for (const url of [
    "https://v2.invalid/api/team-tools/candidates?source=players&q=",
    "https://v2.invalid/api/team-tools/candidates?source=players&q=a&days=3",
    "https://v2.invalid/api/team-tools/candidates?source=season&origin=unknown",
    "https://v2.invalid/api/team-tools/candidates?source=season&days=8",
    "https://v2.invalid/api/team-tools/candidates?source=season&origin=site&origin=kakao",
    "https://v2.invalid/api/team-tools/candidates?source=season&admin=true",
  ]) {
    assert.equal(parseTeamBalanceCandidateQuery(url), null, url);
  }
});
