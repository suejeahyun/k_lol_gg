import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { FakeRiotGateway, FakeRiotIdentityProtector, FakeRsoAdapter, RiotApplicationService, parseAdminRiotQuery } from "../src/modules/riot";
import { InMemoryRiotAdapter } from "../src/modules/riot/infrastructure/in-memory-riot-adapter";
import { isRiotFeatureEnabled } from "../src/modules/riot/infrastructure/riot-runtime-policy";
import {
  riotAccountLinks,
  riotCommandReceipts,
  riotOutbox,
  riotRsoStates,
  riotSummaries,
  riotSyncJobs,
} from "../src/platform/db/schema/riot";

type DrizzleSnapshot = Readonly<{
  schemas: Record<string, unknown>;
  tables: Record<string, unknown>;
  enums: Record<string, unknown>;
}>;

function addedKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(after).filter((key) => !(key in before)).sort();
}

test("S12 schema exposes durable ledgers without OAuth token/code/request-log columns", () => {
  const tables = [riotAccountLinks, riotRsoStates, riotSyncJobs, riotSummaries, riotCommandReceipts, riotOutbox];
  const columnNames = tables.flatMap((table) => getTableConfig(table).columns.map((column) => column.name));
  assert.equal(columnNames.includes("protected_puuid"), true);
  assert.equal(columnNames.includes("state_digest"), true);
  assert.equal(columnNames.includes("lease_id"), true);
  assert.equal(columnNames.includes("request_hash"), true);
  for (const forbidden of ["puuid", "token", "authorization_code", "request_log_id", "client_secret"]) {
    assert.equal(columnNames.includes(forbidden), false, forbidden);
  }
  assert.ok(getTableConfig(riotCommandReceipts).indexes.some((index) => index.config.name === "riot_receipts_actor_scope_key_uidx"));
  assert.ok(getTableConfig(riotOutbox).indexes.some((index) => index.config.name === "riot_outbox_dedupe_uidx"));
  assert.ok(getTableConfig(riotAccountLinks).indexes.some((index) => index.config.name === "riot_links_connected_normalized_key_uidx"));
  assert.ok(getTableConfig(riotAccountLinks).indexes.some((index) => index.config.name === "riot_links_connected_owner_uidx"));
});

test("0014 migration and snapshot add only the S12 Riot schema", () => {
  const before = JSON.parse(readFileSync(new URL("../drizzle/meta/0013_snapshot.json", import.meta.url), "utf8")) as DrizzleSnapshot;
  const after = JSON.parse(readFileSync(new URL("../drizzle/meta/0014_snapshot.json", import.meta.url), "utf8")) as DrizzleSnapshot;
  const sql = readFileSync(new URL("../drizzle/0014_s12_riot.sql", import.meta.url), "utf8");
  const riotTables = [
    "riot.account_links",
    "riot.command_receipts",
    "riot.outbox",
    "riot.rso_states",
    "riot.summaries",
    "riot.sync_jobs",
  ];
  const riotEnums = [
    "riot.link_method",
    "riot.link_status",
    "riot.outbox_status",
    "riot.sync_requester",
    "riot.sync_status",
  ];

  assert.deepEqual(addedKeys(before.schemas, after.schemas), ["riot"]);
  assert.deepEqual(addedKeys(before.tables, after.tables), riotTables);
  assert.deepEqual(addedKeys(before.enums, after.enums), riotEnums);
  assert.deepEqual(Object.keys(before.tables).filter((key) => !(key in after.tables)), []);
  assert.deepEqual(Object.keys(before.enums).filter((key) => !(key in after.enums)), []);
  for (const table of riotTables) {
    const [schema, name] = table.split(".");
    assert.match(sql, new RegExp(`CREATE TABLE "${schema}"\\."${name}"`));
  }
  for (const enumName of riotEnums) {
    const [schema, name] = enumName.split(".");
    assert.match(sql, new RegExp(`CREATE TYPE "${schema}"\\."${name}"`));
  }
  assert.doesNotMatch(sql, /"catalog"\."champion_(?:command_receipts|outbox)"/u);
  assert.doesNotMatch(sql, /"discipline"\./u);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/iu);
});

test("Riot production feature flag is exact and fail-closed by default", () => {
  assert.equal(isRiotFeatureEnabled({}), false);
  assert.equal(isRiotFeatureEnabled({ V2_RIOT_INTEGRATION_ENABLED: "1" }), false);
  assert.equal(isRiotFeatureEnabled({ V2_RIOT_INTEGRATION_ENABLED: "TRUE" }), false);
  assert.equal(isRiotFeatureEnabled({ V2_RIOT_INTEGRATION_ENABLED: "true" }), true);
});

test("explicit fake runtime adapter connects application mutations to safe query DTOs", async () => {
  const adapter = new InMemoryRiotAdapter(true);
  adapter.bindOwner("account-1", "player-1");
  const service = new RiotApplicationService({
    ...adapter.dependencies,
    gateway: new FakeRiotGateway(true),
    rso: new FakeRsoAdapter("test-runtime", true),
    identityProtector: new FakeRiotIdentityProtector(),
  });
  await service.connectDirect({
    context: {
      principalId: "account-1",
      requestId: "request-1",
      issuedAt: new Date("2026-09-07T00:00:00.000Z").toISOString(),
      authorizationIntent: { kind: "OWNER_SESSION", sessionId: "session-1", role: "USER", authVersion: 0, transactionRecheck: true },
      idempotencyKeyMaterial: new TextEncoder().encode("fake-runtime-contract-key"),
      bodyDigestHex: "a".repeat(64),
    },
    playerId: "player-1",
    expectedRevision: 0,
    gameName: "Ahri",
    tagLine: "KR1",
  });
  const status = await adapter.getOwnerStatus("account-1");
  assert.equal(status?.link?.riotId, "Ahri#KR1");
  assert.equal(JSON.stringify(status).includes("puuid"), false);
});

test("admin Riot query is bounded and rejects duplicate or unknown HTTP parameters", () => {
  assert.deepEqual(parseAdminRiotQuery("https://example.test/admin/riot?tab=sync&status=FAILED&page=2&pageSize=50"), { tab: "sync", action: "NONE", status: "FAILED", source: "ALL", q: "", batchSize: 10, page: 2, pageSize: 50 });
  assert.deepEqual(parseAdminRiotQuery("https://example.test/admin/riot?tab=logs&source=AUDIT"), { tab: "logs", action: "NONE", status: "ALL", source: "AUDIT", q: "", batchSize: 10, page: 1, pageSize: 25 });
  assert.deepEqual(parseAdminRiotQuery("https://example.test/admin/riot?tab=accounts&action=bulk-link&q=Ahri&batchSize=30"), { tab: "accounts", action: "bulk-link", status: "UNLINKED", source: "ALL", q: "Ahri", batchSize: 30, page: 1, pageSize: 30 });
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=accounts&source=API"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=accounts&q=Ahri"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=accounts&action=bulk-link&batchSize=31"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=accounts&action=bulk-link&q=a&q=b"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=sync&status=CONNECTED"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?pageSize=101"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?tab=sync&tab=logs"), null);
  assert.equal(parseAdminRiotQuery("https://example.test/admin/riot?includeSecrets=true"), null);
});

test("public, owner, admin HTTP routes and responsive UI states are present", () => {
  const routes = [
    "../src/app/api/riot/player/[playerId]/summary/route.ts",
    "../src/app/api/me/riot/route.ts",
    "../src/app/api/me/riot/sync/route.ts",
    "../src/app/api/me/riot/rso/start/route.ts",
    "../src/app/api/me/riot/rso/callback/route.ts",
    "../src/app/api/admin/riot/route.ts",
    "../src/app/api/admin/riot/link/route.ts",
    "../src/app/api/admin/riot/bulk/route.ts",
    "../src/app/api/admin/riot/bulk-link/route.ts",
    "../src/app/api/admin/riot/sync/route.ts",
    "../src/app/api/admin/riot/retry/route.ts",
  ];
  for (const route of routes) assert.equal(existsSync(new URL(route, import.meta.url)), true, route);

  const account = readFileSync(new URL("../src/app/(public)/account/riot/page.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../src/app/(admin)/admin/riot/page.tsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/app/(public)/(registry)/players/[playerId]/page.tsx", import.meta.url), "utf8");
  for (const source of [account, admin, player]) {
    assert.match(source, /unavailable/);
    assert.match(source, /error/);
  }
  assert.match(account, /Riot 계정 연결/);
  assert.match(admin, /표시할 연동 계정이 없습니다/);
  assert.match(admin, /data-riot-state="accounts"/);
  assert.match(admin, /data-riot-state="sync"/);
  assert.match(admin, /data-riot-state="logs"/);
  assert.match(admin, /data-riot-action/);
  assert.match(admin, /action=bulk-link/);
  assert.match(admin, /Riot 계정 연결 현황/);
  assert.match(admin, /Riot 동기화 작업 이력/);
  assert.match(admin, /Riot API·동기화·감사 로그/);
  const actions = readFileSync(new URL("../src/components/riot/riot-admin-actions.tsx", import.meta.url), "utf8");
  assert.match(actions, /일괄 동기화 미리보기/);
  assert.match(actions, /활성 미연동 플레이어 미리보기/);
  assert.match(actions, /\/api\/admin\/riot\/bulk-link/);
  assert.match(actions, /role="dialog"/);
  assert.match(actions, /등록 확인/);
  assert.match(player, /Riot 계정을 연결하지 않았어요/);
  assert.match(player, /공개 전적을 아직 동기화하지 않았어요/);
  const bulkLinkRoute = readFileSync(new URL("../src/app/api/admin/riot/bulk-link/route.ts", import.meta.url), "utf8");
  assert.match(bulkLinkRoute, /requireRiotApiSession\("SUPER_ADMIN"\)/);
  assert.match(bulkLinkRoute, /revision: "required"/);
  assert.match(bulkLinkRoute, /expectedRevision !== 0/);
  assert.match(bulkLinkRoute, /connectDirectBulk/);
});
