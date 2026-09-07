import assert from "node:assert/strict";
import test from "node:test";

import { findGlobalCommands, playerSearchHref } from "../src/modules/navigation/domain/global-command-palette";
import { canonicalUserRoutes } from "../src/modules/navigation/domain/user-navigation";

test("익명 전역 검색은 공개 canonical 기능만 반환한다", () => {
  const results = findGlobalCommands("", { accountSignedIn: false, limit: 50 });
  assert.equal(results.length > 10, true);
  assert.equal(results.every((result) => result.access === "PUBLIC"), true);
  assert.equal(results.some((result) => result.href === "/account"), false);
  assert.equal(results.some((result) => result.href === "/tools/random-team"), true);
  assert.equal(results.some((result) => result.href === "/competitions"), true);
});

test("팔레트 바로 가기는 실제 canonical 사용자 페이지 안에서만 구성된다", () => {
  const canonical = new Set<string>(canonicalUserRoutes.map((route) => route.template));
  const results = findGlobalCommands("", { accountSignedIn: true, limit: 50 });
  assert.equal(results.every((result) => canonical.has(result.href)), true);
  assert.deepEqual(new Set(results.map((result) => result.group)), new Set(["페이지", "도구", "콘텐츠", "계정"]));
});

test("로그인 전역 검색은 페이지·도구·콘텐츠·계정 키워드를 정규화해 찾는다", () => {
  assert.equal(findGlobalCommands("  팀   구성 ", { accountSignedIn: true })[0]?.href, "/tools/team-balance");
  assert.equal(findGlobalCommands("솔랭", { accountSignedIn: true }).some((item) => item.href === "/account/riot"), true);
  assert.equal(findGlobalCommands("사진", { accountSignedIn: true })[0]?.href, "/images");
  assert.equal(findGlobalCommands("비밀번호", { accountSignedIn: true })[0]?.href, "/account/password");
});

test("플레이어 검색은 공백을 정리하고 URL 구성요소를 안전하게 인코딩한다", () => {
  assert.equal(playerSearchHref("   "), null);
  assert.equal(playerSearchHref("  아리  # KR  "), "/players?q=%EC%95%84%EB%A6%AC%20%23%20KR");
  assert.throws(() => findGlobalCommands("", { accountSignedIn: false, limit: 0 }), /GLOBAL_COMMAND_LIMIT_INVALID/);
});
