import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { createDatabase } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { auditEvents, communitySiteRuntimeConfiguration, communitySsoIdentities, siteSettings, userAccounts } from "../../src/platform/db/schema";
import { createDefaultCommunitySiteConfig, setCommunitySiteModule } from "../../src/modules/community-sites/domain/site-configuration";
import { activateManagedSiteDatabase, initializeManagedSiteDatabase, publishManagedSiteConfiguration } from "../../src/modules/community-sites/infrastructure/managed-site-database";

test("managed site bootstrap proves fresh data, serialized retry, identity isolation and reversible settings in PostgreSQL", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated PostgreSQL harness is required.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const databases: string[] = [];
  const pools: Pool[] = [];
  async function freshDatabase() {
    const name = `klol_v2_test_bootstrap_${randomBytes(8).toString("hex")}`;
    assert.match(name, /^klol_v2_test_bootstrap_[a-f0-9]{16}$/u);
    await admin.query(`CREATE DATABASE "${name}"`);
    databases.push(name);
    const url = new URL(connectionString!); url.pathname = `/${name}`;
    assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
    const pool = new Pool({ connectionString: url.toString(), max: 1, idleTimeoutMillis: 1, statement_timeout: 15000 });
    pools.push(pool);
    return { pool, url: url.toString() };
  }
  const setup = { siteId: randomUUID(), ownerHubUserId: randomUUID(), hubOrigin: "https://hub.synthetic.example",
    configuration: { ...createDefaultCommunitySiteConfig(), name: "빈 커뮤니티", slug: "empty-community" }, revision: 2 };
  try {
    const child = await freshDatabase();
    const contender = new Pool({ connectionString: child.url, max: 1, idleTimeoutMillis: 1, statement_timeout: 15000 });
    pools.push(contender);
    const database = createDatabase(child.pool);
    await t.test("concurrent retries on dedicated pinned sessions create one owner and no copied business data", async () => {
      const results = await Promise.all([initializeManagedSiteDatabase(child.pool, setup), initializeManagedSiteDatabase(contender, setup)]);
      assert.equal(results.filter((result) => result.initialized).length, 1);
      const owners = await database.select().from(userAccounts);
      assert.equal(owners.length, 1);
      assert.equal(owners[0].role, "SUPER_ADMIN");
      assert.equal(owners[0].passwordHash, null);
      assert.notEqual(owners[0].id, setup.ownerHubUserId);
      const identities = await database.select().from(communitySsoIdentities);
      assert.equal(identities.length, 1);
      assert.equal(identities[0].userAccountId, owners[0].id);
      assert.equal(identities[0].hubSubject, setup.ownerHubUserId);
      const runtime = (await database.select().from(communitySiteRuntimeConfiguration))[0];
      assert.equal(runtime.ownerUserAccountId, owners[0].id);
      assert.equal(runtime.publicationState, "AWAITING_OWNER");
      const expected = new Set(["auth.user_accounts", "auth.community_sso_identities", "community_sites.runtime_configuration", "audit.events", "operations.site_settings", "recruiting.kakao_operation_settings", "usage.collection"]);
      const tables = (await child.pool.query<{ schemaname: string; tablename: string }>("select schemaname, tablename from pg_tables where schemaname not like 'pg_%' and schemaname not in ('information_schema','drizzle')")).rows;
      for (const table of tables) {
        const name = `${table.schemaname}.${table.tablename}`;
        const count = Number((await child.pool.query(`select count(*)::int as count from "${table.schemaname.replaceAll('"', '""')}"."${table.tablename.replaceAll('"', '""')}"`)).rows[0].count);
        assert.equal(count, expected.has(name) ? 1 : 0, `${name} must contain only bootstrap configuration`);
      }
    });

    await t.test("publishing changes only configuration and an equal revision is an idempotent replay", async () => {
      const memberId = randomUUID();
      await database.insert(userAccounts).values({ id: memberId, loginId: `member-${memberId}`, loginIdNormalized: `member-${memberId}`, role: "USER", status: "PENDING" });
      const nextConfig = { ...setCommunitySiteModule(setup.configuration, "matches", false), name: "변경된 커뮤니티", templateId: "lounge" as const };
      await publishManagedSiteConfiguration(child.pool, { siteId: setup.siteId, configuration: nextConfig, revision: 3 });
      const row = (await database.select().from(communitySiteRuntimeConfiguration))[0];
      assert.equal(row.revision, 3); assert.equal(row.configurationJson.modules.matches, false); assert.equal(row.configurationJson.templateId, "lounge");
      assert.equal(row.publicationState, "AWAITING_OWNER", "a configuration publish cannot open the site");
      assert.equal((await database.select().from(siteSettings))[0].brandName, nextConfig.name);
      const member = (await database.select().from(userAccounts).where(eq(userAccounts.id, memberId)))[0];
      assert.equal(member.status, "PENDING"); assert.equal(member.role, "USER");
      const events = (await database.select().from(auditEvents)).length;
      await publishManagedSiteConfiguration(child.pool, { siteId: setup.siteId, configuration: nextConfig, revision: 3 });
      assert.equal((await database.select().from(auditEvents)).length, events);
      await assert.rejects(publishManagedSiteConfiguration(child.pool, { siteId: setup.siteId, configuration: setup.configuration, revision: 3 }), /CONFIGURATION_REVISION_CONFLICT/);
      await assert.rejects(publishManagedSiteConfiguration(child.pool, { siteId: setup.siteId, configuration: setup.configuration, revision: 2 }), /CONFIGURATION_REVISION_CONFLICT/);
      assert.equal((await initializeManagedSiteDatabase(child.pool, setup)).initialized, false);
      assert.equal((await database.select().from(communitySiteRuntimeConfiguration))[0].revision, 3, "bootstrap replay must not restore old draft settings");
      await publishManagedSiteConfiguration(child.pool, { siteId: setup.siteId, configuration: setup.configuration, revision: 4 });
      assert.equal((await database.select().from(userAccounts)).length, 2);
      assert.equal((await database.select().from(communitySiteRuntimeConfiguration))[0].configurationJson.modules.matches, true);
    });

    await t.test("activation verifies the exact living local owner and is idempotent without revising configuration", async () => {
      const runtime = (await database.select().from(communitySiteRuntimeConfiguration))[0];
      await assert.rejects(activateManagedSiteDatabase(child.pool, { siteId: randomUUID(), ownerHubUserId: setup.ownerHubUserId }), /DATABASE_IDENTITY_MISMATCH/);
      await assert.rejects(activateManagedSiteDatabase(child.pool, { siteId: setup.siteId, ownerHubUserId: randomUUID() }), /COMMUNITY_OWNER_INVALID/);
      await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, runtime.ownerUserAccountId));
      const auditBeforeObservation = (await database.select().from(auditEvents)).length;
      assert.deepEqual(await activateManagedSiteDatabase(child.pool, { ...setup, observeOnly: true }), { communityId: setup.siteId, revision: runtime.revision, publicationState: "AWAITING_OWNER" });
      assert.equal((await database.select().from(auditEvents)).length, auditBeforeObservation);
      await assert.rejects(activateManagedSiteDatabase(child.pool, setup), /COMMUNITY_OWNER_INVALID/);
      assert.equal((await database.select().from(communitySiteRuntimeConfiguration))[0].publicationState, "AWAITING_OWNER");
      await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, runtime.ownerUserAccountId));
      const activated = await activateManagedSiteDatabase(child.pool, setup);
      assert.deepEqual(activated, { communityId: setup.siteId, revision: runtime.revision, publicationState: "ACTIVE" });
      const count = (await database.select().from(auditEvents)).length;
      assert.deepEqual(await activateManagedSiteDatabase(child.pool, setup), activated);
      assert.equal((await database.select().from(auditEvents)).length, count);
      await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, runtime.ownerUserAccountId));
      assert.deepEqual(await activateManagedSiteDatabase(child.pool, setup), activated, "reconciliation observes a prior commit even if the owner is now suspended");
      assert.equal((await database.select().from(auditEvents)).length, count);
      await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, runtime.ownerUserAccountId));
      await publishManagedSiteConfiguration(child.pool, { ...setup, revision: runtime.revision + 1 });
      assert.equal((await database.select().from(communitySiteRuntimeConfiguration))[0].publicationState, "ACTIVE");
    });

    await t.test("foreign community initialization and publish fail without changing the database", async () => {
      const foreign = { ...setup, siteId: randomUUID(), revision: 10 };
      const before = await database.select().from(communitySiteRuntimeConfiguration);
      await assert.rejects(initializeManagedSiteDatabase(child.pool, foreign), /DATABASE_IDENTITY_MISMATCH/);
      await assert.rejects(publishManagedSiteConfiguration(child.pool, foreign), /DATABASE_IDENTITY_MISMATCH/);
      assert.deepEqual(await database.select().from(communitySiteRuntimeConfiguration), before);
      assert.equal((await database.select().from(userAccounts)).length, 2);
    });

    await t.test("an unmarked database with business data is rejected before any migrations", async () => {
      const occupied = await freshDatabase();
      await occupied.pool.query("create table public.synthetic_business (value text not null)");
      await occupied.pool.query("insert into public.synthetic_business values ('preserve-this-row')");
      await assert.rejects(initializeManagedSiteDatabase(occupied.pool, { ...setup, siteId: randomUUID() }), /DATABASE_NOT_EMPTY/);
      assert.equal((await occupied.pool.query("select value from public.synthetic_business")).rows[0].value, "preserve-this-row");
      assert.equal((await occupied.pool.query("select count(*)::int as count from pg_namespace where nspname='auth'")).rows[0].count, 0);
    });

    await t.test("a migration-only interrupted bootstrap resumes without duplicating seed configuration", async () => {
      const interrupted = await freshDatabase();
      await applyMigrations(createDatabase(interrupted.pool));
      assert.equal((await initializeManagedSiteDatabase(interrupted.pool, { ...setup, siteId: randomUUID() })).initialized, true);
      assert.equal((await createDatabase(interrupted.pool).select().from(userAccounts)).length, 1);
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    for (const name of databases) {
      assert.match(name, /^klol_v2_test_bootstrap_[a-f0-9]{16}$/u);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.end();
  }
});
