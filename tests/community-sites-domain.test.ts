import assert from "node:assert/strict";
import test from "node:test";
import { CommunitySiteError, assertCommunitySiteRevision, ownerCommunitySiteTransition, parseCreateCommunitySiteCommand,
  parseOwnerCommunitySiteCommand, parseReviewCommunitySiteCommand, reviewCommunitySiteTransition } from "../src/modules/community-sites/domain/community-site";
import { createDefaultCommunitySiteConfig } from "../src/modules/community-sites/domain/site-configuration";
import { isCommunitySitesEnabled } from "../src/modules/community-sites/infrastructure/runtime-policy";

test("site lifecycle separates review, provisioning, owner acceptance and publication", () => {
  assert.equal(reviewCommunitySiteTransition("SUBMITTED", { action: "approve", reason: "" }), "APPROVED");
  for (const status of ["APPROVED", "PROVISIONING", "FAILED", "ACTIVE"] as const) {
    assert.throws(() => ownerCommunitySiteTransition(status, { action: "activate" }), CommunitySiteError);
  }
  assert.equal(ownerCommunitySiteTransition("AWAITING_OWNER", { action: "activate" }), "ACTIVATING");
  assert.equal(ownerCommunitySiteTransition("ACTIVE", { action: "publish" }), "ACTIVE");
  assert.equal(ownerCommunitySiteTransition("CHANGES_REQUESTED", { action: "submit" }), "SUBMITTED");
  assert.equal(ownerCommunitySiteTransition("CANCELLED", { action: "submit" }), "SUBMITTED");
  assert.equal(ownerCommunitySiteTransition("REJECTED", { action: "cancel" }), "CANCELLED");
  assert.throws(() => ownerCommunitySiteTransition("APPROVED", { action: "update", configuration: createDefaultCommunitySiteConfig() }), CommunitySiteError);
  assert.throws(() => reviewCommunitySiteTransition("ACTIVE", { action: "reject", reason: "거절" }), CommunitySiteError);
});
test("commands reject authority injection and require a meaningful review reason", () => {
  const configuration = createDefaultCommunitySiteConfig();
  assert.deepEqual(parseCreateCommunitySiteCommand({ action: "submit", configuration }).configuration, configuration);
  for (const extra of [{ ownerUserAccountId: "someone-else" }, { status: "ACTIVE" }, { origin: "https://other.example" }]) {
    assert.throws(() => parseCreateCommunitySiteCommand({ action: "submit", configuration, ...extra }), CommunitySiteError);
  }
  assert.throws(() => parseOwnerCommunitySiteCommand({ action: "approve" }), CommunitySiteError);
  assert.throws(() => parseOwnerCommunitySiteCommand({ action: "activate", verified: true }), CommunitySiteError);
  assert.throws(() => parseReviewCommunitySiteCommand({ action: "request_changes", reason: " " }), CommunitySiteError);
  assert.throws(() => parseReviewCommunitySiteCommand({ action: "reject", reason: "사유", configuration }), CommunitySiteError);
  assert.equal(parseReviewCommunitySiteCommand({ action: "reject", reason: "  보완 필요  " }).reason, "보완 필요");
});
test("revision checks and hub-only runtime cannot silently default to another service", () => {
  assertCommunitySiteRevision(0, 0);
  assert.throws(() => assertCommunitySiteRevision(2, 1), /STALE_COMMUNITY_SITE_REVISION/);
  assert.throws(() => assertCommunitySiteRevision(0, -1), /INVALID_COMMUNITY_SITE_REVISION/);
  assert.equal(isCommunitySitesEnabled({ NEXT_PUBLIC_SERVICE_ID: "hub", COMMUNITY_SITES_ENABLED: "true" }), true);
  for (const service of [undefined, "klol", "nexus", "community"]) {
    assert.equal(isCommunitySitesEnabled({ NEXT_PUBLIC_SERVICE_ID: service, COMMUNITY_SITES_ENABLED: "true" }), false);
  }
  assert.equal(isCommunitySitesEnabled({ NEXT_PUBLIC_SERVICE_ID: "hub" }), false);
});
