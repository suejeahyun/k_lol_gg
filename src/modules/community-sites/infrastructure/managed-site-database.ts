import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createDatabase } from "@/platform/db/database";
import { auditEvents, communitySiteRuntimeConfiguration, communitySsoIdentities, siteSettings, userAccounts } from "@/platform/db/schema";
import * as schema from "@/platform/db/schema";
import { toCommunityPublicFeatureFlags, validateCommunitySiteConfig, type CommunitySiteConfig } from "../domain/site-configuration";

type Setup = Readonly<{ siteId: string; hubOrigin: string; ownerHubUserId: string; configuration: CommunitySiteConfig; revision: number }>;
const seedTables = new Set(["operations.site_settings", "recruiting.kakao_operation_settings", "usage.collection"]);
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The caller has verified a dedicated provider database; never initialize an existing business database. */
export async function initializeManagedSiteDatabase(pool: Pool, setup: Setup, migrationsFolder?: string) {
  if (pool.options.max !== 1) throw new Error("MANAGED_BOOTSTRAP_REQUIRES_DEDICATED_POOL");
  const configuration = validateCommunitySiteConfig(setup.configuration);
  if (!Number.isSafeInteger(setup.revision) || setup.revision < 1) throw new Error("CONFIGURATION_REVISION_CONFLICT");
  const client = await pool.connect();
  let locked = false;
  try {
    // Session locks must use the same pinned connection as migrations and writes.
    // A max:1 pool alone can close an idle session between awaited operations.
    await client.query("select pg_advisory_lock(hashtext('gg-community-bootstrap-v1'))");
    locked = true;
    const existing = (await client.query<{ schemaname: string; tablename: string }>("select schemaname, tablename from pg_tables where schemaname not like 'pg_%' and schemaname not in ('information_schema','drizzle')")).rows;
    if (existing.some((table) => table.schemaname === "community_sites" && table.tablename === "runtime_configuration")) {
      const marker = (await client.query<{ community_id: string }>("select community_id from community_sites.runtime_configuration where id=1")).rows[0];
      if (marker) {
        if (marker.community_id !== setup.siteId) throw new Error("DATABASE_IDENTITY_MISMATCH");
        return { initialized: false };
      }
    }
    // Reject data before running migrations too: an old child database must not be upgraded by this initializer.
    for (const table of existing) {
      const name = `${table.schemaname}.${table.tablename}`;
      const count = Number((await client.query(`select count(*)::int as count from (select 1 from ${quote(table.schemaname)}.${quote(table.tablename)} limit 2) as sample`)).rows[0].count);
      if (count !== (seedTables.has(name) ? 1 : 0)) throw new Error("DATABASE_NOT_EMPTY");
    }
    const database = drizzle(client, { schema });
    await migrate(database, { migrationsFolder: migrationsFolder ?? resolve(process.cwd(), "drizzle") });
    await database.transaction(async (transaction) => {
      const ownerId = randomUUID();
      const now = new Date();
      // Local site ownership is provisioned explicitly. No central role or password is imported.
      await transaction.insert(userAccounts).values({ id: ownerId, loginId: `hub-${setup.ownerHubUserId}`, loginIdNormalized: `hub-${setup.ownerHubUserId}`,
        passwordHash: null, role: "SUPER_ADMIN", status: "APPROVED", statusChangedAt: now });
      await transaction.insert(communitySsoIdentities).values({ hubIssuer: setup.hubOrigin, hubSubject: setup.ownerHubUserId, userAccountId: ownerId });
      await transaction.insert(communitySiteRuntimeConfiguration).values({ id: 1, communityId: setup.siteId, ownerUserAccountId: ownerId, publicationState: "AWAITING_OWNER", configurationJson: configuration, revision: setup.revision });
      await transaction.update(siteSettings).set({ brandName: configuration.name, tagline: configuration.description.slice(0, 160) || "함께 만드는 우리 커뮤니티",
        supportUrl: null, featuresJson: toCommunityPublicFeatureFlags(configuration), aiAllowedRolesJson: [], aiDailyCostLimitMicros: 0, updatedAt: now }).where(eq(siteSettings.id, 1));
      await transaction.insert(auditEvents).values({ requestId: randomUUID(), actorUserAccountId: ownerId, action: "MANAGED_COMMUNITY_INITIALIZED", targetType: "COMMUNITY", targetId: setup.siteId,
        afterJson: { templateId: configuration.templateId, revision: setup.revision }, metadataJson: { importedBusinessData: false, hubRoleImported: false } });
    });
    return { initialized: true };
  } finally {
    let destroyConnection = false;
    if (locked) {
      try { await client.query("select pg_advisory_unlock(hashtext('gg-community-bootstrap-v1'))"); }
      catch { destroyConnection = true; }
    }
    client.release(destroyConnection);
  }
}

/** Only the durable activation job may open a prepared child; retries never add another audit event. */
export async function activateManagedSiteDatabase(pool: Pool, setup: Pick<Setup, "siteId" | "ownerHubUserId"> & { observeOnly?: boolean }) {
  return createDatabase(pool).transaction(async (transaction) => {
    const row = (await transaction.select().from(communitySiteRuntimeConfiguration).where(eq(communitySiteRuntimeConfiguration.id, 1)).for("update"))[0];
    if (!row || row.communityId !== setup.siteId) throw new Error("DATABASE_IDENTITY_MISMATCH");
    const owner = (await transaction.select().from(userAccounts).where(eq(userAccounts.id, row.ownerUserAccountId)).for("update"))[0];
    const identity = (await transaction.select().from(communitySsoIdentities).where(and(eq(communitySsoIdentities.userAccountId, row.ownerUserAccountId), eq(communitySsoIdentities.hubSubject, setup.ownerHubUserId))).limit(1))[0];
    if (!identity) throw new Error("COMMUNITY_OWNER_INVALID");
    // Reconciliation reports an already committed publication without authorizing new work.
    if (row.publicationState === "ACTIVE") return { communityId: row.communityId, revision: row.revision, publicationState: "ACTIVE" as const };
    if (setup.observeOnly) return { communityId: row.communityId, revision: row.revision, publicationState: "AWAITING_OWNER" as const };
    if (!owner || owner.deletedAt || owner.role !== "SUPER_ADMIN" || owner.status !== "APPROVED") throw new Error("COMMUNITY_OWNER_INVALID");
    await transaction.update(communitySiteRuntimeConfiguration).set({ publicationState: "ACTIVE", updatedAt: new Date() }).where(eq(communitySiteRuntimeConfiguration.id, 1));
    await transaction.insert(auditEvents).values({ requestId: randomUUID(), actorUserAccountId: owner.id, action: "MANAGED_COMMUNITY_ACTIVATED", targetType: "COMMUNITY", targetId: setup.siteId,
      beforeJson: { publicationState: row.publicationState }, afterJson: { publicationState: "ACTIVE", revision: row.revision } });
    return { communityId: row.communityId, revision: row.revision, publicationState: "ACTIVE" as const };
  });
}

export async function publishManagedSiteConfiguration(pool: Pool, setup: Pick<Setup, "siteId" | "configuration" | "revision">) {
  const configuration = validateCommunitySiteConfig(setup.configuration);
  if (!Number.isSafeInteger(setup.revision) || setup.revision < 1) throw new Error("CONFIGURATION_REVISION_CONFLICT");
  return createDatabase(pool).transaction(async (transaction) => {
    const row = (await transaction.select().from(communitySiteRuntimeConfiguration).where(eq(communitySiteRuntimeConfiguration.id, 1)).for("update"))[0];
    if (!row || row.communityId !== setup.siteId) throw new Error("DATABASE_IDENTITY_MISMATCH");
    if (row.revision > setup.revision) throw new Error("CONFIGURATION_REVISION_CONFLICT");
    if (row.revision === setup.revision) {
      if (JSON.stringify(validateCommunitySiteConfig(row.configurationJson)) !== JSON.stringify(configuration)) throw new Error("CONFIGURATION_REVISION_CONFLICT");
      return;
    }
    await transaction.update(communitySiteRuntimeConfiguration).set({ configurationJson: configuration, revision: setup.revision, updatedAt: new Date() }).where(eq(communitySiteRuntimeConfiguration.id, 1));
    await transaction.update(siteSettings).set({ brandName: configuration.name, tagline: configuration.description.slice(0, 160) || "함께 만드는 우리 커뮤니티",
      featuresJson: toCommunityPublicFeatureFlags(configuration), revision: sql`${siteSettings.revision}+1`, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
    await transaction.insert(auditEvents).values({ requestId: randomUUID(), action: "MANAGED_COMMUNITY_CONFIGURATION_PUBLISHED", targetType: "COMMUNITY", targetId: setup.siteId,
      afterJson: { revision: setup.revision, templateId: configuration.templateId }, metadataJson: { existingRecordsPreserved: true } });
  });
}
