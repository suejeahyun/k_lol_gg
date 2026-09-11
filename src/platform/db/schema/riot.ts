import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { riotSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const riotLinkMethod = riotSchema.enum("link_method", ["DIRECT_OWNER", "RSO_VERIFIED", "ADMIN"]);
export const riotLinkStatus = riotSchema.enum("link_status", ["CONNECTED", "DISCONNECTED", "REVOKED"]);
export const riotSyncStatus = riotSchema.enum("sync_status", ["QUEUED", "RUNNING", "RETRY_WAIT", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]);
export const riotSyncRequester = riotSchema.enum("sync_requester", ["OWNER", "ADMIN", "SUPER_ADMIN", "JOB"]);
export const riotOutboxStatus = riotSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);

export const riotAccountLinks = riotSchema.table("account_links", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  ownerUserAccountId: uuid("owner_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  gameName: varchar("game_name", { length: 16 }).notNull(),
  tagLine: varchar("tag_line", { length: 5 }).notNull(),
  normalizedKey: varchar("normalized_key", { length: 24 }).notNull(),
  protectedPuuid: text("protected_puuid"),
  method: riotLinkMethod("method").notNull(),
  status: riotLinkStatus("status").default("CONNECTED").notNull(),
  linkedAt: timestamptz("linked_at").notNull(),
  disconnectedAt: timestamptz("disconnected_at"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("riot_links_player_uidx").on(table.playerId),
    uniqueIndex("riot_links_connected_normalized_key_uidx")
      .on(table.normalizedKey)
      .where(sql`${table.status} = 'CONNECTED'`),
    uniqueIndex("riot_links_connected_owner_uidx")
      .on(table.ownerUserAccountId)
      .where(sql`${table.status} = 'CONNECTED'`),
    index("riot_links_owner_status_idx").on(table.ownerUserAccountId, table.status),
    foreignKey({
      name: "riot_links_player_owner_fk",
      columns: [table.playerId, table.ownerUserAccountId],
      foreignColumns: [players.id, players.userAccountId],
    }).onDelete("restrict"),
  index("riot_links_normalized_idx").on(table.normalizedKey),
  check("riot_links_revision_nonnegative", sql`${table.revision} >= 0`),
  check("riot_links_normalized_nonempty", sql`char_length(btrim(${table.normalizedKey})) BETWEEN 3 AND 24`),
  check("riot_links_status_payload", sql`(
    (${table.status} = 'CONNECTED' AND ${table.protectedPuuid} IS NOT NULL AND ${table.disconnectedAt} IS NULL)
    OR (${table.status} <> 'CONNECTED' AND ${table.protectedPuuid} IS NULL AND ${table.disconnectedAt} IS NOT NULL)
  )`),
]);

export const riotRsoStates = riotSchema.table("rso_states", {
  id: uuid("id").primaryKey(),
  ownerUserAccountId: uuid("owner_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  stateDigest: bytea("state_digest").notNull(),
  returnTo: varchar("return_to", { length: 500 }).notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  exchangeId: uuid("exchange_id"),
  exchangeStartedAt: timestamptz("exchange_started_at"),
  consumedAt: timestamptz("consumed_at"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("riot_rso_state_digest_uidx").on(table.stateDigest),
  index("riot_rso_expiry_idx").on(table.expiresAt),
  check("riot_rso_digest_length", sql`octet_length(${table.stateDigest}) = 32`),
  check("riot_rso_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  check("riot_rso_exchange_pair", sql`(${table.exchangeId} IS NULL) = (${table.exchangeStartedAt} IS NULL)`),
]);

/**
 * Short-lived encrypted cache for an already accepted OAuth authorization code.
 * It closes the application-transaction retry window without retaining tokens or
 * a plaintext PUUID. The state row remains the owner and expiry authority.
 */
export const riotRsoExchangeResults = riotSchema.table("rso_exchange_results", {
  stateId: uuid("state_id").primaryKey().references(() => riotRsoStates.id, { onDelete: "cascade" }),
  codeDigest: bytea("code_digest").notNull(),
  keyId: varchar("key_id", { length: 32 }).notNull(),
  protectedIdentity: text("protected_identity").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  index("riot_rso_exchange_expiry_idx").on(table.expiresAt),
  check("riot_rso_exchange_code_digest", sql`octet_length(${table.codeDigest}) = 32`),
  check("riot_rso_exchange_key_id", sql`char_length(btrim(${table.keyId})) BETWEEN 1 AND 32`),
  check("riot_rso_exchange_protected", sql`char_length(${table.protectedIdentity}) BETWEEN 32 AND 4000`),
  check("riot_rso_exchange_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const riotSyncJobs = riotSchema.table("sync_jobs", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  linkId: uuid("link_id").notNull().references(() => riotAccountLinks.id, { onDelete: "restrict" }),
  requestedBy: riotSyncRequester("requested_by").notNull(),
  status: riotSyncStatus("status").default("QUEUED").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  maximumAttempts: integer("maximum_attempts").default(5).notNull(),
  requestedAt: timestamptz("requested_at").notNull(),
  availableAt: timestamptz("available_at").notNull(),
  lockedAt: timestamptz("locked_at"),
  leaseId: uuid("lease_id"),
  completedAt: timestamptz("completed_at"),
  failureCode: varchar("failure_code", { length: 48 }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  index("riot_sync_claim_idx").on(table.status, table.availableAt, table.id),
  index("riot_sync_link_requested_idx").on(table.linkId, table.requestedAt.desc()),
  check("riot_sync_revision_nonnegative", sql`${table.revision} >= 0`),
  check("riot_sync_attempts", sql`${table.attemptCount} BETWEEN 0 AND ${table.maximumAttempts} AND ${table.maximumAttempts} BETWEEN 1 AND 10`),
  check("riot_sync_lease_pair", sql`(${table.status} = 'RUNNING') = (${table.lockedAt} IS NOT NULL AND ${table.leaseId} IS NOT NULL)`),
]);

export const riotSummaries = riotSchema.table("summaries", {
  playerId: uuid("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  linkId: uuid("link_id").notNull().references(() => riotAccountLinks.id, { onDelete: "restrict" }),
  gameName: varchar("game_name", { length: 16 }).notNull(),
  tagLine: varchar("tag_line", { length: 5 }).notNull(),
  soloTier: varchar("solo_tier", { length: 16 }),
  soloRank: varchar("solo_rank", { length: 8 }),
  leaguePoints: integer("league_points"),
  wins: integer("wins"),
  losses: integer("losses"),
  lastSyncedAt: timestamptz("last_synced_at").notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("riot_summaries_link_uidx").on(table.linkId),
  check("riot_summaries_counts_nonnegative", sql`(${table.leaguePoints} IS NULL OR ${table.leaguePoints} >= 0) AND (${table.wins} IS NULL OR ${table.wins} >= 0) AND (${table.losses} IS NULL OR ${table.losses} >= 0)`),
]);

export const riotCommandReceipts = riotSchema.table("command_receipts", {
  id: uuid("id").primaryKey(),
  actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  scope: varchar("scope", { length: 128 }).notNull(),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  bodyDigestHex: varchar("body_digest_hex", { length: 64 }).notNull(),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("riot_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
  index("riot_receipts_expiry_idx").on(table.expiresAt),
  check("riot_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
  check("riot_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
  check("riot_receipts_body_digest", sql`${table.bodyDigestHex} ~ '^[a-f0-9]{64}$'`),
  check("riot_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const riotOutbox = riotSchema.table("outbox", {
  id: uuid("id").primaryKey(),
  requestId: uuid("request_id").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  dedupeKey: varchar("dedupe_key", { length: 256 }).notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  status: riotOutboxStatus("status").default("PENDING").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  deliveredAt: timestamptz("delivered_at"),
}, (table) => [
  uniqueIndex("riot_outbox_dedupe_uidx").on(table.dedupeKey),
  index("riot_outbox_pending_idx").on(table.createdAt, table.id).where(sql`${table.status} = 'PENDING'`),
  check("riot_outbox_revision_nonnegative", sql`${table.aggregateRevision} >= 0`),
  check("riot_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
]);
