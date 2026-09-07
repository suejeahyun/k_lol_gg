import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const legacyRouteFiles = [
  "account/tier/route.ts",
  "ai-balance/route.ts",
  "ai-balance/players/route.ts",
  "app/page.tsx",
  "app/account/route.ts",
  "app/coin-toss/route.ts",
  "app/install/route.ts",
  "app/login/route.ts",
  "app/matches/route.ts",
  "app/matches/[matchId]/route.ts",
  "app/me/route.ts",
  "app/me/riot/route.ts",
  "app/players/page.tsx",
  "app/players/[legacyId]/route.ts",
  "app/progress/destruction/[tournamentId]/route.ts",
  "app/progress/destruction/[tournamentId]/mvp-vote/route.ts",
  "app/progress/event/[eventId]/route.ts",
  "app/random-team/route.ts",
  "app/rankings/route.ts",
  "app/recruits/route.ts",
  "balance/route.ts",
  "coin-toss/route.ts",
  "destruction-auction-live/[tournamentId]/route.ts",
  "discipline/evidence/route.ts",
  "kakao/route.ts",
  "me/player/route.ts",
  "me/riot/route.ts",
  "participation/route.ts",
  "participation/destruction/[tournamentId]/route.ts",
  "participation/destruction/[tournamentId]/captain-points/route.ts",
  "participation/destruction/[tournamentId]/participants/route.ts",
  "participation/destruction/[tournamentId]/participants/[playerId]/route.ts",
  "participation/event/[eventId]/route.ts",
  "participation/season/route.ts",
  "players/[playerId]/riot/route.ts",
  "players/balance/route.ts",
  "players/balance/drafts/route.ts",
  "players/balance/drafts/[draftId]/route.ts",
  "players/balance/drafts/[draftId]/recommendations/route.ts",
  "players/balance/recommendations/route.ts",
  "progress/route.ts",
  "progress/destruction/route.ts",
  "progress/destruction/[tournamentId]/route.ts",
  "progress/destruction/[tournamentId]/images/route.ts",
  "progress/destruction/[tournamentId]/images/[imageIndex]/route.ts",
  "progress/destruction/[tournamentId]/mvp-vote/route.ts",
  "progress/event/route.ts",
  "progress/event/[eventId]/route.ts",
  "random-team/route.ts",
  "recruit/route.ts",
  "recruit-helper/route.ts",
  "riot-api/route.ts",
] as const;

test("USER_ROUTE_MAP의 redirect 32개와 통합 20개는 모두 한 버전 호환 진입점을 가진다", () => {
  assert.equal(legacyRouteFiles.length, 52);
  for (const routeFile of legacyRouteFiles) {
    assert.equal(
      existsSync(new URL(`../src/app/(public)/(legacy)/${routeFile}`, import.meta.url)),
      true,
      routeFile,
    );
  }
});
