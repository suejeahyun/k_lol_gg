import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { normalizeLoginId, validateNewPassword } from "../../src/modules/accounts/domain/account-contracts";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { createCommunityNetworkSnapshot, parseCommunityNetworkInput, type CommunityNetworkInput } from "../../src/modules/community-network/domain/community-network";
import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import { requireRuntimeDatabaseUrl, type DatabaseRuntimeEnvironment } from "../../src/platform/db/runtime-database-url";
import { auditEvents, communityNetworkState, networkCommunities, networkRooms, userAccounts } from "../../src/platform/db/schema";

export type HubBootstrapEnvironment = DatabaseRuntimeEnvironment & Readonly<{
  HUB_DATABASE_NAME?: string;
  HUB_BOOTSTRAP_CONFIRM?: string;
  HUB_ADMIN_LOGIN_ID?: string;
  HUB_ADMIN_PASSWORD?: string;
}>;

export function hubBootstrapTarget(environment: HubBootstrapEnvironment) {
  if (environment.NEXT_PUBLIC_SERVICE_ID !== "hub") throw new Error("HUB bootstrap requires NEXT_PUBLIC_SERVICE_ID=hub.");
  if (environment.HUB_BOOTSTRAP_CONFIRM !== "CREATE_EMPTY_HUB") throw new Error("HUB_BOOTSTRAP_CONFIRM must be CREATE_EMPTY_HUB.");
  const connectionString = requireRuntimeDatabaseUrl(environment);
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const localTest = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /^klol_v2_test_hub_[a-z0-9_]+$/u.test(databaseName);
  if (environment.HUB_DATABASE_NAME !== databaseName || (!["gg_hub", "gg_hub_local"].includes(databaseName) && !localTest)) {
    throw new Error("HUB_DATABASE_NAME must exactly identify gg_hub, gg_hub_local, or an owned loopback hub test database.");
  }
  return { connectionString, databaseName } as const;
}

export function hubBootstrapAdministrator(environment: HubBootstrapEnvironment) {
  const loginId = environment.HUB_ADMIN_LOGIN_ID?.trim();
  const password = environment.HUB_ADMIN_PASSWORD;
  if (!loginId || !/^[a-zA-Z0-9_-]{4,64}$/u.test(loginId) || !validateNewPassword(password)) {
    throw new Error("HUB bootstrap requires a private HUB_ADMIN_LOGIN_ID and a valid HUB_ADMIN_PASSWORD; credentials are never imported from a child site.");
  }
  return { loginId, password: password! };
}

/** Only public, user-specified site and room metadata; no child database access. */
export function initialHubRegistry(): CommunityNetworkInput {
  const klolId = randomUUID(), nexusId = randomUUID();
  return parseCommunityNetworkInput({
    communities: [
      { id: klolId, slug: "klol", name: "K-LOL.GG", origin: "https://k-lol-gg.vercel.app", description: "LoL 내전과 파티 모집을 함께하는 K-LOL 커뮤니티입니다.", state: "LISTED" },
      { id: nexusId, slug: "nexus", name: "NEXUS.GG", origin: "https://nexus-gg-kr.vercel.app", description: "함께하는 순간, 더 특별한 우리. NEXUS 커뮤니티입니다.", state: "LISTED" },
    ],
    rooms: [
      { id: randomUUID(), communityId: klolId, displayName: "LOL - K", purpose: "CHAT", dataGroupKey: "klol-main", active: true },
      { id: randomUUID(), communityId: klolId, displayName: "K롤방 구인구직방", purpose: "RECRUIT", dataGroupKey: "klol-main", active: true },
      { id: randomUUID(), communityId: nexusId, displayName: "NEXUS", purpose: "CHAT", dataGroupKey: "nexus-main", active: true },
      { id: randomUUID(), communityId: nexusId, displayName: "NEXUS구인구직방", purpose: "RECRUIT", dataGroupKey: "nexus-main", active: true },
    ],
  });
}

const bootstrapAction = "HUB_BOOTSTRAP_COMPLETED";
const bootstrapVersion = "hub-bootstrap-v1";
const baseSettings = new Set(["operations.site_settings", "recruiting.kakao_operation_settings", "usage.collection"]);
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function applicationTables(pool: Pool) {
  return (await pool.query<{ schema: string; name: string }>(`
    select schemaname as schema, tablename as name from pg_tables
    where schemaname not like 'pg_%' and schemaname not in ('information_schema', 'drizzle')
    order by schemaname, tablename
  `)).rows;
}

async function assertMigrationJournal(pool: Pool) {
  const expected = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder });
  const actual = (await pool.query<{ hash: string; created_at: string }>("select hash, created_at from drizzle.__drizzle_migrations order by created_at")).rows;
  if (actual.length !== expected.length || actual.some((row, index) => row.hash !== expected[index]!.hash || Number(row.created_at) !== expected[index]!.folderMillis)) {
    throw new Error("HUB bootstrap refused: migration journal does not match the reviewed source.");
  }
  return expected.length;
}

async function assertEmptyBusinessData(pool: Pool) {
  const tables = await applicationTables(pool);
  for (const table of tables) {
    const key = `${table.schema}.${table.name}`;
    const qualified = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
    const count = Number((await pool.query(`select count(*)::int as count from ${qualified}`)).rows[0].count);
    if (count !== (baseSettings.has(key) ? 1 : 0)) throw new Error(`HUB bootstrap refused: ${key} contains unexpected existing data.`);
  }
}

/**
 * Run only through a dedicated max:1 pool. A session advisory lock spans the
 * migration transaction and the atomic initial owner/registry transaction.
 * The audit receipt makes replay read-only, preserving subsequent admin edits.
 */
export async function bootstrapHubDatabase(pool: Pool, expectedDatabaseName: string, administrator: Readonly<{ loginId: string; password: string }>) {
  if (pool.options.max !== 1) throw new Error("HUB bootstrap requires a dedicated max:1 pool.");
  const validatedAdmin = hubBootstrapAdministrator({ HUB_ADMIN_LOGIN_ID: administrator.loginId, HUB_ADMIN_PASSWORD: administrator.password });
  const actualName = (await pool.query<{ name: string }>("select current_database() as name")).rows[0]!.name;
  if (actualName !== expectedDatabaseName) throw new Error("HUB bootstrap refused: connected database does not match the confirmed target.");
  await pool.query("select pg_advisory_lock(hashtext('gg-hub-empty-database-bootstrap-v1'))");
  try {
    const existing = await applicationTables(pool);
    if (existing.length) {
      if (!existing.some((table) => table.schema === "operations" && table.name === "site_settings")) throw new Error("HUB bootstrap refused: unrecognized existing tables.");
      const identity = (await pool.query("select brand_name from operations.site_settings where id = 1")).rows[0]?.brand_name;
      if (identity === "GG HUB") {
        const receipts = (await pool.query("select id from audit.events where action = $1 and target_type = 'HUB' and target_id = $2", [bootstrapAction, bootstrapVersion])).rows;
        if (receipts.length !== 1) throw new Error("HUB bootstrap refused: initial setup receipt is missing or ambiguous.");
        return { service: "hub", databaseName: actualName, state: "already-initialized", migrationCount: await assertMigrationJournal(pool), modified: false } as const;
      }
      // A crash after migration commit but before setup can be resumed only
      // with the exact reviewed journal and no accounts or business records.
      if (identity !== "K-LOL.GG") throw new Error("HUB bootstrap refused: existing database belongs to a different service.");
      await assertMigrationJournal(pool);
      await assertEmptyBusinessData(pool);
    }
    await applyMigrations(createDatabase(pool));
    const migrationCount = await assertMigrationJournal(pool);
    await assertEmptyBusinessData(pool);
    const passwordHash = await hashPassword(validatedAdmin.password);
    const snapshot = createCommunityNetworkSnapshot(initialHubRegistry(), 1);
    const administratorId = randomUUID();
    const now = new Date();
    await createDatabase(pool).transaction(async (transaction) => {
      // Bootstrap has no browser session. Its explicit one-time authority is
      // the empty-database guard, then all setup is committed together.
      await transaction.insert(userAccounts).values({
        id: administratorId, loginId: validatedAdmin.loginId, loginIdNormalized: normalizeLoginId(validatedAdmin.loginId), passwordHash,
        role: "SUPER_ADMIN", status: "APPROVED", mustChangePassword: true, passwordChangedAt: now, statusChangedAt: now,
      });
      await transaction.insert(networkCommunities).values([...snapshot.communities]);
      await transaction.insert(networkRooms).values([...snapshot.rooms]);
      await transaction.insert(communityNetworkState).values({ id: 1, revision: 1, updatedByUserAccountId: administratorId });
      await transaction.execute("update operations.site_settings set brand_name = 'GG HUB', tagline = '독립된 커뮤니티를 한곳에서', features_json = '{\"registrations\":true,\"matchSubmissions\":false,\"teamBalance\":false,\"kakaoHelp\":false,\"riotIntegration\":false,\"aiAssistant\":false}'::jsonb, ai_allowed_roles_json = '[]'::jsonb, support_url = null where id = 1");
      await transaction.insert(auditEvents).values({
        requestId: randomUUID(), actorUserAccountId: administratorId, action: bootstrapAction, targetType: "HUB", targetId: bootstrapVersion,
        afterJson: { communities: 2, rooms: 4, administratorsCreated: 1, revision: 1 },
        metadataJson: { metadataOnly: true, childDataImported: false, phoneRoutingChanged: false, mustChangePassword: true },
      });
    });
    return { service: "hub", databaseName: actualName, state: "initialized", migrationCount, communities: 2, rooms: 4, administratorsCreated: 1, childDataImported: false, phoneRoutingChanged: false, mustChangePassword: true } as const;
  } finally {
    await pool.query("select pg_advisory_unlock(hashtext('gg-hub-empty-database-bootstrap-v1'))");
  }
}
