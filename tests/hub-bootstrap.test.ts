import assert from "node:assert/strict";
import test from "node:test";
import { hubBootstrapAdministrator, hubBootstrapTarget, initialHubRegistry } from "../scripts/hub/empty-database";
import { createCommunityNetworkSnapshot } from "../src/modules/community-network/domain/community-network";

test("hub creation requires an explicit dedicated target and creation intent", () => {
  const environment = { NEXT_PUBLIC_SERVICE_ID: "hub", HUB_DATABASE_URL: "postgres://localhost/gg_hub", HUB_DATABASE_NAME: "gg_hub", HUB_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_HUB" };
  assert.equal(hubBootstrapTarget(environment).databaseName, "gg_hub");
  assert.throws(() => hubBootstrapTarget({ ...environment, NEXT_PUBLIC_SERVICE_ID: "nexus" }), /requires NEXT_PUBLIC_SERVICE_ID=hub/);
  assert.throws(() => hubBootstrapTarget({ ...environment, HUB_BOOTSTRAP_CONFIRM: "" }), /CREATE_EMPTY_HUB/);
  assert.throws(() => hubBootstrapTarget({ ...environment, HUB_DATABASE_URL: "postgres://localhost/nexus_gg", HUB_DATABASE_NAME: "nexus_gg" }), /exactly identify/);
  assert.throws(() => hubBootstrapTarget({ ...environment, HUB_DATABASE_URL: "postgres://remote.invalid/klol_v2_test_hub_x", HUB_DATABASE_NAME: "klol_v2_test_hub_x" }), /exactly identify/);
  assert.throws(() => hubBootstrapTarget({ ...environment, HUB_DATABASE_NAME: "other" }), /exactly identify/);
  assert.throws(() => hubBootstrapTarget({ ...environment, DATABASE_URL: "postgres://localhost/gg_hub" }), /different database/);
});

test("bootstrap administrator credentials are explicit and independently validated", () => {
  assert.throws(() => hubBootstrapAdministrator({}), /private HUB_ADMIN_LOGIN_ID/);
  assert.throws(() => hubBootstrapAdministrator({ HUB_ADMIN_LOGIN_ID: "test-admin", HUB_ADMIN_PASSWORD: "weak" }), /valid HUB_ADMIN_PASSWORD/);
  assert.equal(hubBootstrapAdministrator({ HUB_ADMIN_LOGIN_ID: "test-admin", HUB_ADMIN_PASSWORD: "Synthetic-Password-123!" }).loginId, "test-admin");
});

test("initial hub registry contains only the two authorized sites and their four room metadata", () => {
  const snapshot = createCommunityNetworkSnapshot(initialHubRegistry(), 1);
  assert.deepEqual(snapshot.communities.map((site) => site.origin), ["https://k-lol-gg.vercel.app", "https://nexus-gg-kr.vercel.app"]);
  assert.deepEqual(snapshot.rooms.map((room) => room.displayName), ["LOL - K", "K롤방 구인구직방", "NEXUS", "NEXUS구인구직방"]);
  assert.equal(new Set(snapshot.rooms.map((room) => room.communityId)).size, 2);
  assert.equal(snapshot.connectionStatus, "UNVERIFIED");
  assert.equal(snapshot.routingStatus, "NOT_APPLIED");
  assert.equal(new Set(snapshot.rooms.map((room) => room.dataGroupKey)).size, 2);
});
