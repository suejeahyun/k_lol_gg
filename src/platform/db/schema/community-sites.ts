import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { CommunitySiteConfig } from "@/modules/community-sites/domain/site-configuration";
import type { CommunitySiteJobKind, CommunitySiteJobStatus, CommunitySiteStatus } from "@/modules/community-sites/domain/community-site";
import { userAccounts } from "./auth";
import { communitySitesSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });
export const communitySiteRuntimeConfiguration = communitySitesSchema.table("runtime_configuration", {
  id: integer("id").primaryKey(),
  communityId: uuid("community_id").notNull(),
  ownerUserAccountId: uuid("owner_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  publicationState: varchar("publication_state", { length: 16 }).$type<"AWAITING_OWNER" | "ACTIVE">().default("AWAITING_OWNER").notNull(),
  configurationJson: jsonb("configuration_json").$type<CommunitySiteConfig>().notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  check("community_site_runtime_singleton", sql`${table.id} = 1`),
  check("community_site_runtime_publication_state", sql`${table.publicationState} IN ('AWAITING_OWNER', 'ACTIVE')`),
  check("community_site_runtime_revision", sql`${table.revision} BETWEEN 1 AND 9007199254740991`),
  check("community_site_runtime_configuration", sql`jsonb_typeof(${table.configurationJson}) = 'object'`),
]);

export const communitySites = communitySitesSchema.table("sites", {
  id: uuid("id").primaryKey(),
  ownerUserAccountId: uuid("owner_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 64 }).notNull(),
  configurationJson: jsonb("configuration_json").$type<CommunitySiteConfig>().notNull(),
  publishedConfigurationJson: jsonb("published_configuration_json").$type<CommunitySiteConfig>(),
  status: varchar("status", { length: 24 }).$type<CommunitySiteStatus>().notNull(),
  revision: bigint("revision", { mode: "number" }).default(1).notNull(),
  reviewReason: varchar("review_reason", { length: 1000 }),
  reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  reviewedAt: timestamptz("reviewed_at"),
  origin: varchar("origin", { length: 300 }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("community_sites_slug_uidx").on(table.slug).where(sql`${table.status} NOT IN ('REJECTED', 'CANCELLED')`),
  uniqueIndex("community_sites_origin_uidx").on(table.origin),
  index("community_sites_owner_updated_idx").on(table.ownerUserAccountId, table.updatedAt),
  index("community_sites_status_created_idx").on(table.status, table.createdAt),
  check("community_sites_slug", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("community_sites_status", sql`${table.status} IN ('SUBMITTED','CHANGES_REQUESTED','REJECTED','CANCELLED','APPROVED','PROVISIONING','AWAITING_OWNER','ACTIVATING','ACTIVE','FAILED')`),
  check("community_sites_revision", sql`${table.revision} BETWEEN 1 AND 9007199254740991`),
  check("community_sites_configuration", sql`jsonb_typeof(${table.configurationJson}) = 'object' AND ${table.configurationJson}->>'slug' = ${table.slug}`),
  check("community_sites_published_configuration", sql`${table.publishedConfigurationJson} IS NULL OR jsonb_typeof(${table.publishedConfigurationJson}) = 'object'`),
  check("community_sites_origin", sql`${table.origin} IS NULL OR ${table.origin} LIKE 'https://%'`),
  check("community_sites_ready", sql`${table.status} NOT IN ('AWAITING_OWNER','ACTIVATING','ACTIVE') OR (${table.origin} IS NOT NULL AND ${table.publishedConfigurationJson} IS NOT NULL)`),
]);

export const communitySiteProvisioningJobs = communitySitesSchema.table("provisioning_jobs", {
  id: uuid("id").primaryKey(),
  siteId: uuid("site_id").notNull().references(() => communitySites.id, { onDelete: "restrict" }),
  kind: varchar("kind", { length: 24 }).$type<CommunitySiteJobKind>().notNull(),
  status: varchar("status", { length: 16 }).$type<CommunitySiteJobStatus>().default("PENDING").notNull(),
  configurationJson: jsonb("configuration_json").$type<CommunitySiteConfig>().notNull(),
  siteRevision: bigint("site_revision", { mode: "number" }).notNull(),
  requestedByUserAccountId: uuid("requested_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  checkpoint: varchar("checkpoint", { length: 64 }).default("QUEUED").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  resourceJson: jsonb("resource_json").$type<Record<string, string>>().default({}).notNull(),
  errorCode: varchar("error_code", { length: 96 }),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: timestamptz("lease_expires_at"),
  nextAttemptAt: timestamptz("next_attempt_at").defaultNow().notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  completedAt: timestamptz("completed_at"),
}, (table) => [
  uniqueIndex("community_site_jobs_active_uidx").on(table.siteId).where(sql`${table.status} IN ('PENDING','RUNNING')`),
  index("community_site_jobs_dispatch_idx").on(table.status, table.nextAttemptAt),
  index("community_site_jobs_site_created_idx").on(table.siteId, table.createdAt),
  check("community_site_jobs_kind", sql`${table.kind} IN ('PROVISION','PUBLISH_CONFIGURATION','ACTIVATE_SITE')`),
  check("community_site_jobs_status", sql`${table.status} IN ('PENDING','RUNNING','SUCCEEDED','FAILED')`),
  check("community_site_jobs_revision", sql`${table.siteRevision} BETWEEN 1 AND 9007199254740991`),
  check("community_site_jobs_attempt", sql`${table.attemptCount} >= 0`),
  check("community_site_jobs_configuration", sql`jsonb_typeof(${table.configurationJson}) = 'object'`),
  check("community_site_jobs_resources", sql`jsonb_typeof(${table.resourceJson}) = 'object'`),
  check("community_site_jobs_lease", sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`),
]);

export const communitySiteCommandReceipts = communitySitesSchema.table("command_receipts", {
  id: uuid("id").primaryKey(),
  actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => communitySites.id, { onDelete: "restrict" }),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  responseStatus: integer("response_status").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("community_site_receipts_actor_key_uidx").on(table.actorUserAccountId, table.keyHash),
  index("community_site_receipts_expiry_idx").on(table.expiresAt),
  check("community_site_receipts_hashes", sql`octet_length(${table.keyHash}) = 32 AND octet_length(${table.requestHash}) = 32`),
  check("community_site_receipts_revision", sql`${table.revision} BETWEEN 1 AND 9007199254740991`),
  check("community_site_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);
