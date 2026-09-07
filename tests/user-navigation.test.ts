import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  canonicalUserRoutes,
  isUserNavigationActive,
  userNavigationSections,
} from "../src/modules/navigation/domain/user-navigation";

test("USER_ROUTE_MAP canonical 사용자 경로 37개가 중복 없이 분류된다", () => {
  assert.equal(canonicalUserRoutes.length, 37);
  assert.equal(new Set(canonicalUserRoutes.map((route) => route.template)).size, 37);
  assert.equal(userNavigationSections.length, 6);

  const counts = Object.fromEntries(
    userNavigationSections.map((section) => [
      section.id,
      canonicalUserRoutes.filter((route) => route.section === section.id).length,
    ]),
  );

  assert.deepEqual(counts, {
    "home-account": 6,
    "auth-help": 9,
    "registry-match": 7,
    tools: 5,
    competitions: 4,
    community: 6,
  });
});

test("page-contract로 표시한 사용자 경로는 실제 App Router 페이지가 있다", () => {
  const pageContracts = canonicalUserRoutes.filter(
    (route) => route.implementationState === "page-contract",
  );
  assert.deepEqual(pageContracts.map((route) => route.template), [
    "/",
    "/start",
    "/account",
    "/account/password",
    "/login",
    "/signup",
    "/forgot-password",
    "/terms",
    "/privacy",
    "/help/kakao",
    "/help/recruits",
    "/help/riot",
    "/install",
    "/players",
    "/players/[playerId]",
    "/matches",
    "/matches/[matchId]",
    "/matches/submit",
    "/rankings",
    "/rankings/mmr",
    "/tools/team-balance",
    "/tools/team-balance/drafts",
    "/tools/team-balance/drafts/[draftId]",
    "/tools/random-team",
    "/tools/coin-toss",
    "/applications",
    "/recruits",
    "/highlights",
    "/highlights/[highlightId]",
    "/images",
    "/images/[imageId]",
  ]);

  const pages = [
    "../src/app/(public)/(home)/page.tsx",
    "../src/app/(public)/(guides)/start/page.tsx",
    "../src/app/(public)/account/page.tsx",
    "../src/app/(public)/account/password/page.tsx",
    "../src/app/(public)/login/page.tsx",
    "../src/app/(public)/signup/page.tsx",
    "../src/app/(public)/forgot-password/page.tsx",
    "../src/app/(public)/terms/page.tsx",
    "../src/app/(public)/privacy/page.tsx",
    "../src/app/(public)/(recruiting)/help/kakao/page.tsx",
    "../src/app/(public)/(recruiting)/help/recruits/page.tsx",
    "../src/app/(public)/(guides)/help/riot/page.tsx",
    "../src/app/(public)/(guides)/install/page.tsx",
    "../src/app/(public)/(registry)/players/page.tsx",
    "../src/app/(public)/(registry)/players/[playerId]/page.tsx",
    "../src/app/(public)/(matches)/matches/page.tsx",
    "../src/app/(public)/(matches)/matches/[matchId]/page.tsx",
    "../src/app/(public)/(matches)/matches/submit/page.tsx",
    "../src/app/(public)/(statistics)/rankings/page.tsx",
    "../src/app/(public)/(statistics)/rankings/mmr/page.tsx",
    "../src/app/(public)/(tools)/tools/team-balance/page.tsx",
    "../src/app/(public)/(tools)/tools/team-balance/drafts/page.tsx",
    "../src/app/(public)/(tools)/tools/team-balance/drafts/[draftId]/page.tsx",
    "../src/app/(public)/(tools)/tools/random-team/page.tsx",
    "../src/app/(public)/(tools)/tools/coin-toss/page.tsx",
    "../src/app/(public)/(applications)/applications/page.tsx",
    "../src/app/(public)/(recruiting)/recruits/page.tsx",
    "../src/app/(public)/(media)/highlights/page.tsx",
    "../src/app/(public)/(media)/highlights/[highlightId]/page.tsx",
    "../src/app/(public)/(media)/images/page.tsx",
    "../src/app/(public)/(media)/images/[imageId]/page.tsx",
  ];
  for (const page of pages) assert.equal(existsSync(new URL(page, import.meta.url)), true, page);
});

test("공지·뉴스·패치노트는 현재 V1 기능 계약에 없으므로 V2 canonical을 꾸며내지 않는다", () => {
  const templates = canonicalUserRoutes.map((route) => route.template);
  assert.equal(templates.some((route) => /news|notice|patch/i.test(route)), false);
});

test("현재 경로 표시는 홈을 하위 경로 전체에 오인 적용하지 않는다", () => {
  assert.equal(isUserNavigationActive("/", "/"), true);
  assert.equal(isUserNavigationActive("/players", "/"), false);
  assert.equal(isUserNavigationActive("/players/example", "/players"), true);
  assert.equal(isUserNavigationActive("/matches", "/players"), false);
});
