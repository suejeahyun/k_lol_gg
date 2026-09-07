import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyAppLoginDestination,
  buildLegacyAppMatchesDestination,
  buildLegacyCanonicalIdDestination,
  buildLegacyDestructionImageDestination,
  buildLegacyDestructionParticipantDestination,
  buildLegacyPlayerBalanceRecommendationDestination,
  legacyRedirectResponse,
} from "../src/modules/navigation/application/legacy-user-redirects";

test("legacy 앱 로그인은 내부 next만 보존하고 중복·외부 주소는 계정으로 축소한다", () => {
  assert.equal(buildLegacyAppLoginDestination({}), "/login");
  assert.equal(buildLegacyAppLoginDestination({ next: ["/matches?from=2026-09-01"] }), "/login?next=%2Fmatches%3Ffrom%3D2026-09-01");
  assert.equal(buildLegacyAppLoginDestination({ next: ["https://evil.example"] }), "/login?next=%2Faccount");
  assert.equal(buildLegacyAppLoginDestination({ next: ["/matches", "/admin"] }), "/login?next=%2Faccount");
});

test("legacy 경기 목록은 canonical 공개 필터만 단일 값으로 보존한다", () => {
  assert.equal(
    buildLegacyAppMatchesDestination({
      q: [" 저녁 내전 "],
      winner: ["BLUE"],
      from: ["2026-09-01"],
      to: ["2026-09-07"],
      pageSize: ["24"],
      token: ["drop"],
      order: ["asc", "desc"],
    }),
    "/matches?q=%EC%A0%80%EB%85%81+%EB%82%B4%EC%A0%84&winner=BLUE&from=2026-09-01&to=2026-09-07&pageSize=24",
  );
});

test("동적 legacy ID와 밸런스 추천 query는 path traversal과 미검토 값을 버린다", () => {
  assert.equal(buildLegacyCanonicalIdDestination("/matches", "match_01", "/matches"), "/matches/match_01");
  assert.equal(buildLegacyCanonicalIdDestination("/matches", "../admin", "/matches"), "/matches");
  const id = "018fa2d0-8d4e-7abc-8def-1234567890ab";
  assert.equal(
    buildLegacyPlayerBalanceRecommendationDestination({ draftId: [id], team: ["BLUE"], next: ["//evil"] }),
    `/tools/team-balance/drafts?view=recommendations&draftId=${id}&team=BLUE`,
  );
});

test("멸망전 참가자와 이미지 legacy deep link는 검증한 ID와 ordinal만 보존한다", () => {
  assert.equal(buildLegacyDestructionParticipantDestination("tournament_01", "player_01"), "/competitions/destruction/tournament_01?tab=participants&player=player_01");
  assert.equal(buildLegacyDestructionParticipantDestination("../admin", "player_01"), "/applications");
  assert.equal(buildLegacyDestructionImageDestination("tournament_01", "4"), "/competitions/destruction/tournament_01?tab=gallery&image=4");
  assert.equal(buildLegacyDestructionImageDestination("tournament_01", "-1"), "/competitions?type=destruction");
});

test("legacy redirect 응답은 상대 Location과 no-store를 사용한다", () => {
  const response = legacyRedirectResponse("/install");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/install");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.throws(() => legacyRedirectResponse("//evil.example"));
});
