import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseSiteSupportInput } from "../src/modules/recruiting/operation-forms/site-support";
import { findGlobalCommands } from "../src/modules/navigation/domain/global-command-palette";
import { safeListReturn } from "../src/modules/navigation/domain/list-return";
import { createRouteMetadata, createPublicMetadata, STATIC_SITEMAP_CONTRACTS, SEO_ROUTE_CONTRACTS } from "../src/modules/seo/domain/site-seo";
import { userMenuRoutes } from "../src/modules/navigation/domain/user-navigation";

test("Every task can be found by plain Korean intent before login", () => {
  for (const [query, route] of [["팀 만들기", "/tools/team-balance"], ["  팀   구성 ", "/tools/team-balance"], ["내 제출", "/matches/submissions"], ["오류", "/help"]]) assert.equal(findGlobalCommands(query, { accountSignedIn: false })[0]?.href, route);
});
test("List return preserves exact filters and rejects external or sibling destinations", () => {
  assert.equal(safeListReturn("/players?q=test&tier=GOLD&page=3", "/players"), "/players?q=test&tier=GOLD&page=3");
  for (const unsafe of ["//evil.invalid/players", "/\\evil.invalid", "/matches?page=3", "javascript:alert(1)"]) assert.equal(safeListReturn(unsafe, "/players"), "/players");
  assert.equal(safeListReturn("/rankings?view=players", "/rankings?view=teams"), "/rankings?view=teams");
});
test("Support consent is explicit and unknown or oversized inputs fail closed", () => {
  const input = { nickname: "테스트", replyTo: "qa@example.invalid", category: "오류 신고", content: "화면 오류", consent: true };
  assert.equal(parseSiteSupportInput(input).applicantNickname, input.replyTo);
  for (const invalid of [{ ...input, consent: false }, { ...input, adminNote: "injected" }, { ...input, category: "unknown" }, { ...input, content: "x".repeat(4001) }, { ...input, replyTo: "" }, { ...input, nickname: "\u0000" }]) assert.throws(() => parseSiteSupportInput(invalid));
});
test("Route metadata covers public and protected pages without indexing private activity", () => {
  for (const route of userMenuRoutes) assert.ok(SEO_ROUTE_CONTRACTS.some((seo) => seo.template === route.template), route.template);
  for (const route of ["/account", "/matches/submit", "/matches/submissions", "/help/contact", "/tools/team-balance/drafts"]) {
    const metadata = createRouteMetadata(route);
    assert.equal(metadata.robots && typeof metadata.robots === "object" && metadata.robots.index, false);
    assert.ok(!STATIC_SITEMAP_CONTRACTS.some((seo) => seo.template === route));
  }
  const metadata = createPublicMetadata({ title: "제목\u0000".repeat(30), description: "설명 ".repeat(100), canonical: "/players" });
  assert.ok(String(metadata.title).length <= 60);
  assert.ok(String(metadata.description).length <= 160);
  assert.doesNotMatch(String(metadata.title), /\u0000/);
});
test("Search Enter opens a matching task and offers an explicit player search separately", () => {
  const source = readFileSync(new URL("../src/components/navigation/user-site-navigation.tsx", import.meta.url), "utf8");
  assert.match(source, /commands\[0\]\?\.href \?\? playerHref/);
  assert.match(source, /search-player-link/);
  assert.match(source, /event.preventDefault\(\)/);
  assert.match(source, /event.key === "ArrowDown"/);
});
