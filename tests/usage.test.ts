import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { excludedUsageAgent, parseUsageEvent, usageEnabled, usageRange, usageRoute } from "../src/modules/usage/domain/usage";
import { createUsageVisitor, readUsageVisitor } from "../src/modules/usage/infrastructure/visitor-cookie";

test("usage route templates remove identifiers, queries and sensitive pages", () => {
  assert.equal(usageRoute("/players/some-player?q=secret#section"), "/players/:id");
  assert.equal(usageRoute("/matches/submit"), "/matches/submit");
  assert.equal(usageRoute("/tools/team-balance/drafts/123"), "/tools/team-balance/drafts/:id");
  assert.equal(usageRoute("/login?next=/account"), "/login");
  assert.equal(usageRoute("/signup"), "/signup");
  for (const route of ["//evil.test", "/admin", "/account/password", "/api/matches", "/unknown/secret"]) assert.equal(usageRoute(route), null);
});
test("event ingestion rejects arbitrary text, client identity and unreviewed targets", () => {
  const event = { id: randomUUID(), kind: "page", route: "/players/:id", target: null };
  assert.deepEqual(parseUsageEvent(event), event);
  for (const candidate of [{ ...event, userId: randomUUID() }, { ...event, query: "nickname" }, { ...event, route: "/players/alice" }, { ...event, target: "password" }, { ...event, id: "x" }, { ...event, kind: "search" }]) assert.equal(parseUsageEvent(candidate), null);
  assert.ok(parseUsageEvent({ ...event, kind: "click", target: "team-balance.quick" }));
});
test("KST range respects midnight, calendar boundaries and bounded retention", () => {
  const now = new Date("2026-09-30T02:00:00Z");
  const range = usageRange(undefined, undefined, now);
  assert.equal(range.from, "2026-09-01");
  assert.equal(range.start.toISOString(), "2026-08-31T15:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-30T15:00:00.000Z");
  assert.equal(range.days, 30);
  for (const dates of [["2026-09-31", "2026-09-30"], ["2026-09-10", "2026-09-01"], ["2026-06-01", "2026-09-30"], ["2026-01-01", "2026-01-02"], ["2026-10-01", "2026-10-02"]]) assert.throws(() => usageRange(dates[0], dates[1], now));
  assert.throws(() => usageRange(["2026-09-01"] as unknown as string, undefined, now));
});
test("collection requires explicit production configuration and filters recognizable bots", () => {
  const env = { USAGE_ANALYTICS_ENABLED: "true", V2_PUBLIC_DATA_SOURCE: "postgres", USAGE_ANALYTICS_SECRET: "a".repeat(32) };
  assert.equal(usageEnabled(env), true);
  assert.equal(usageEnabled({ ...env, VERCEL_ENV: "preview" }), false);
  assert.equal(usageEnabled({ ...env, USAGE_ANALYTICS_SECRET: undefined }), false);
  assert.equal(usageEnabled({ ...env, USAGE_ANALYTICS_ENABLED: "false" }), false);
  assert.equal(excludedUsageAgent("Googlebot"), true);
  assert.equal(excludedUsageAgent("HeadlessChrome"), true);
  assert.equal(excludedUsageAgent("Mozilla/5.0 Chrome/140 Safari"), false);
});
test("signed visitor cookies reject forgery and key changes", () => {
  const secret = "a".repeat(32), visitor = createUsageVisitor(secret);
  assert.equal(readUsageVisitor(visitor.value, secret), visitor.id);
  assert.equal(readUsageVisitor(visitor.value, "b".repeat(32)), null);
  assert.equal(readUsageVisitor(`${randomUUID()}.${visitor.value.split(".")[1]}`, secret), null);
  assert.equal(readUsageVisitor("invalid", secret), null);
});
