import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNITY_SITE_STATUSES, type CommunitySite } from "../src/modules/community-sites/domain/community-site";
import { createDefaultCommunitySiteConfig } from "../src/modules/community-sites/domain/site-configuration";
import { communitySiteOwnerGuidance } from "../src/modules/community-sites/domain/owner-guidance";

const site: CommunitySite = { id: "00000000-0000-4000-8000-000000000001", ownerUserAccountId: "owner", configuration: createDefaultCommunitySiteConfig(), publishedConfiguration: null, status: "SUBMITTED", revision: 1, reviewReason: null, origin: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", latestJob: null };
test("every persisted site state has a concrete next action or waiting explanation", () => {
  for (const status of COMMUNITY_SITE_STATUSES) {
    const guidance = communitySiteOwnerGuidance({ ...site, status });
    assert.ok(guidance.title.length > 5); assert.ok(guidance.description.length > 20);
  }
  assert.match(communitySiteOwnerGuidance({ ...site, status: "CHANGES_REQUESTED" }).description, /초안을 저장.*다시 심사 요청/u);
  assert.match(communitySiteOwnerGuidance({ ...site, status: "PROVISIONING" }).description, /닫아도 작업은 계속/u);
  assert.match(communitySiteOwnerGuidance({ ...site, status: "FAILED" }).description, /새 신청을 만들지 말고/u);
});
test("a failed publish on an active site is not described as completed or a failed new site", () => {
  const latestJob = { id: "job", kind: "PUBLISH_CONFIGURATION" as const, status: "FAILED" as const, checkpoint: "VERIFY", attemptCount: 3, errorCode: "PROVIDER_UNAVAILABLE", createdAt: site.createdAt, updatedAt: site.updatedAt };
  const guidance = communitySiteOwnerGuidance({ ...site, status: "ACTIVE", latestJob });
  assert.match(guidance.title, /설정 반영/u); assert.match(guidance.description, /일부 변경이 이미 적용/u);
  assert.match(communitySiteOwnerGuidance({ ...site, status: "ACTIVATING", latestJob: { ...latestJob, kind: "ACTIVATE_SITE" } }).title, /운영팀/u);
});
