import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNITY_SITE_STATUSES, type CommunitySite } from "../src/modules/community-sites/domain/community-site";
import { createDefaultCommunitySiteConfig } from "../src/modules/community-sites/domain/site-configuration";
import { communitySiteNeedsAttention, filterOwnedCommunitySites, matchesSiteOverviewFilter } from "../src/modules/community-sites/domain/site-overview";

const sites: CommunitySite[] = COMMUNITY_SITE_STATUSES.map((status, index) => ({
  id: `site-${index}`, status, ownerUserAccountId: "synthetic-owner", configuration: { ...createDefaultCommunitySiteConfig(), name: `클럽 ${index}`, slug: `club-${index}` },
  publishedConfiguration: null, revision: 0, reviewReason: null, origin: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", latestJob: null,
}));
test("overview separates all lifecycle states without losing rejected or cancelled requests", () => {
  assert.equal(filterOwnedCommunitySites(sites, "all", "").length, 10);
  assert.deepEqual(filterOwnedCommunitySites(sites, "attention", "").map(s => s.status).sort(), ["AWAITING_OWNER", "CHANGES_REQUESTED", "FAILED", "REJECTED"]);
  assert.equal(filterOwnedCommunitySites(sites, "preparing", "").length, 5);
  assert.deepEqual(filterOwnedCommunitySites(sites, "closed", "").map(s => s.status).sort(), ["CANCELLED", "REJECTED"]);
  assert.deepEqual(filterOwnedCommunitySites(sites, "active", "").map(s => s.status), ["ACTIVE"]);
});
test("failed publication needs attention while the site remains active", () => {
  const active: CommunitySite = { ...sites.find(s => s.status === "ACTIVE")!, latestJob: { id: "job", kind: "PUBLISH_CONFIGURATION", status: "FAILED", checkpoint: "DEPLOY", attemptCount: 1, errorCode: "TIMEOUT", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" } };
  assert.equal(communitySiteNeedsAttention(active), true);
  assert.equal(matchesSiteOverviewFilter(active, "active"), true);
  assert.equal(matchesSiteOverviewFilter(active, "attention"), true);
});
test("overview search normalizes width and case, combines all terms and never mutates input", () => {
  const input = [{ ...sites[0], configuration: { ...sites[0].configuration, name: "NEXUS 클럽", description: "야간 내전" } }, { ...sites[1], updatedAt: "2026-11-01T10:00:00Z" }];
  const before = JSON.stringify(input);
  assert.equal(filterOwnedCommunitySites(input, "all", "ｎｅｘｕｓ 야간").length, 1);
  assert.equal(filterOwnedCommunitySites(input, "attention", "NEXUS").length, 0);
  assert.equal(filterOwnedCommunitySites(input, "all", "NEXUS 없는단어").length, 0);
  assert.equal(filterOwnedCommunitySites(input, "all", "")[0].id, input[1].id);
  assert.equal(JSON.stringify(input), before);
});
