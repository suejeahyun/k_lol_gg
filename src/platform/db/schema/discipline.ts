import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { privateAssets } from "./matches";
import { disciplineSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const disciplineType = disciplineSchema.enum("discipline_type", ["CAUTION", "WARNING", "BAN"]);
export const disciplineCategory = disciplineSchema.enum("discipline_category", ["GENERAL", "INHOUSE"]);
export const disciplineTaskStatus = disciplineSchema.enum("task_status", ["REQUIRED", "AWAITING_UPLOAD", "PENDING_REVIEW", "REJECTED", "APPROVED", "CANCELLED"]);
export const disciplineBanReviewStatus = disciplineSchema.enum("ban_review_status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export const disciplineOutboxStatus = disciplineSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);

export const disciplineRecords = disciplineSchema.table("records", {
  id: uuid("id").primaryKey(),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  identityKey: varchar("identity_key", { length: 255 }).notNull(),
  userAccountId: uuid("user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "restrict" }),
  targetName: varchar("target_name", { length: 100 }).notNull(),
  targetNickname: varchar("target_nickname", { length: 64 }),
  targetTagLine: varchar("target_tag_line", { length: 32 }),
  type: disciplineType("type").notNull(),
  category: disciplineCategory("category").default("GENERAL").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  internalNote: varchar("internal_note", { length: 2000 }),
  active: boolean("active").default(true).notNull(),
  resetReason: varchar("reset_reason", { length: 1000 }),
  resetByUserAccountId: uuid("reset_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  resetAt: timestamptz("reset_at"),
  createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  index("discipline_records_identity_active_idx").on(table.identityKey, table.active, table.createdAt),
  index("discipline_records_type_active_idx").on(table.type, table.active, table.createdAt),
  index("discipline_records_account_idx").on(table.userAccountId, table.createdAt),
  index("discipline_records_player_idx").on(table.playerId, table.createdAt),
  check("discipline_records_revision_nonnegative", sql`${table.revision} >= 0`),
  check("discipline_records_reason_nonempty", sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 1000`),
  check("discipline_records_identity_present", sql`${table.userAccountId} IS NOT NULL OR ${table.playerId} IS NOT NULL OR char_length(btrim(${table.targetName})) > 0`),
  check("discipline_records_reset_consistency", sql`(${table.active} = true AND ${table.resetAt} IS NULL AND ${table.resetReason} IS NULL) OR (${table.active} = false AND ${table.resetAt} IS NOT NULL AND char_length(btrim(${table.resetReason})) > 0)`),
]);

export const disciplineResolutionTasks = disciplineSchema.table("resolution_tasks", {
  id: uuid("id").primaryKey(),
  publicCode: varchar("public_code", { length: 64 }).notNull(),
  disciplineRecordId: uuid("discipline_record_id").notNull().references(() => disciplineRecords.id, { onDelete: "restrict" }),
  ownerUserAccountId: uuid("owner_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  ownerPlayerId: uuid("owner_player_id").references(() => players.id, { onDelete: "restrict" }),
  category: disciplineCategory("category").notNull(),
  requiredGameCount: integer("required_game_count").notNull(),
  dueAt: timestamptz("due_at").notNull(),
  status: disciplineTaskStatus("status").default("REQUIRED").notNull(),
  reviewNote: varchar("review_note", { length: 1000 }),
  reviewBoundaryAt: timestamptz("review_boundary_at"),
  reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  reviewedAt: timestamptz("reviewed_at"),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("discipline_tasks_public_code_uidx").on(table.publicCode),
  uniqueIndex("discipline_tasks_record_uidx").on(table.disciplineRecordId),
  index("discipline_tasks_owner_status_idx").on(table.ownerUserAccountId, table.status, table.dueAt),
  index("discipline_tasks_status_updated_idx").on(table.status, table.updatedAt),
  check("discipline_tasks_revision_nonnegative", sql`${table.revision} >= 0`),
  check("discipline_tasks_required_count", sql`${table.requiredGameCount} BETWEEN 1 AND 100`),
  check("discipline_tasks_owner_present", sql`${table.ownerUserAccountId} IS NOT NULL OR ${table.ownerPlayerId} IS NOT NULL`),
]);

export const disciplineEvidence = disciplineSchema.table("evidence", {
  id: uuid("id").primaryKey(),
  taskId: uuid("task_id").notNull().references(() => disciplineResolutionTasks.id, { onDelete: "restrict" }),
  privateAssetId: uuid("private_asset_id").notNull().references(() => privateAssets.id, { onDelete: "restrict" }),
  submittedAt: timestamptz("submitted_at").notNull(),
  supersededAt: timestamptz("superseded_at"),
}, (table) => [
  uniqueIndex("discipline_evidence_asset_uidx").on(table.privateAssetId),
  index("discipline_evidence_task_submitted_idx").on(table.taskId, table.submittedAt, table.id),
  check("discipline_evidence_superseded_after_submit", sql`${table.supersededAt} IS NULL OR ${table.supersededAt} >= ${table.submittedAt}`),
]);

/** Durable resource binding exists from STAGED onward; evidence rows are created only after READY submission. */
export const disciplineAssetBindings = disciplineSchema.table("asset_bindings", {
  privateAssetId: uuid("private_asset_id").primaryKey().references(() => privateAssets.id, { onDelete: "restrict" }),
  taskId: uuid("task_id").notNull().references(() => disciplineResolutionTasks.id, { onDelete: "restrict" }),
  ownerUserAccountId: uuid("owner_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
}, (table) => [index("discipline_asset_bindings_task_idx").on(table.taskId, table.createdAt)]);

export const disciplineCautionConversions = disciplineSchema.table("caution_conversions", {
  cautionRecordId: uuid("caution_record_id").notNull().references(() => disciplineRecords.id, { onDelete: "restrict" }),
  warningRecordId: uuid("warning_record_id").notNull().references(() => disciplineRecords.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.cautionRecordId, table.warningRecordId] }), uniqueIndex("discipline_conversion_caution_uidx").on(table.cautionRecordId)]);

export const disciplineBanReviews = disciplineSchema.table("ban_reviews", {
  id: uuid("id").primaryKey(),
  identityKey: varchar("identity_key", { length: 255 }).notNull(),
  warningRecordIdsJson: jsonb("warning_record_ids_json").$type<string[]>().notNull(),
  status: disciplineBanReviewStatus("status").default("PENDING").notNull(),
  reviewNote: varchar("review_note", { length: 1000 }),
  reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  reviewedAt: timestamptz("reviewed_at"),
  revision: bigint("revision", { mode: "number" }).default(0).notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("discipline_ban_reviews_pending_identity_uidx").on(table.identityKey).where(sql`${table.status} = 'PENDING'`),
  check("discipline_ban_reviews_revision_nonnegative", sql`${table.revision} >= 0`),
  check("discipline_ban_reviews_warning_array", sql`jsonb_typeof(${table.warningRecordIdsJson}) = 'array' AND jsonb_array_length(${table.warningRecordIdsJson}) >= 3`),
]);

export const disciplineCommandReceipts = disciplineSchema.table("command_receipts", {
  id: uuid("id").primaryKey(),
  principalId: varchar("principal_id", { length: 255 }).notNull(),
  actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
  scope: varchar("scope", { length: 128 }).notNull(),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  bodyDigestHex: varchar("body_digest_hex", { length: 64 }).notNull(),
  responseStatus: integer("response_status").notNull(),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  responseEtag: varchar("response_etag", { length: 32 }),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("discipline_receipts_principal_scope_key_uidx").on(table.principalId, table.scope, table.keyHash),
  index("discipline_receipts_expires_idx").on(table.expiresAt),
  check("discipline_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
  check("discipline_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
  check("discipline_receipts_body_digest", sql`${table.bodyDigestHex} ~ '^[a-f0-9]{64}$'`),
  check("discipline_receipts_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
  check("discipline_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const disciplineOutbox = disciplineSchema.table("outbox", {
  id: uuid("id").primaryKey(),
  requestId: uuid("request_id").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  status: disciplineOutboxStatus("status").default("PENDING").notNull(),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  deliveredAt: timestamptz("delivered_at"),
}, (table) => [
  uniqueIndex("discipline_outbox_dedupe_uidx").on(table.dedupeKey),
  index("discipline_outbox_pending_idx").on(table.createdAt, table.id).where(sql`${table.status} = 'PENDING'`),
  check("discipline_outbox_revision_nonnegative", sql`${table.aggregateRevision} >= 0`),
  check("discipline_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
]);

export const disciplineAssetCleanupOutcomes = disciplineSchema.table("asset_cleanup_outcomes", {
  id: uuid("id").primaryKey(),
  privateAssetId: uuid("private_asset_id").notNull().references(() => privateAssets.id, { onDelete: "restrict" }),
  attemptedAt: timestamptz("attempted_at").notNull(),
  succeeded: boolean("succeeded").notNull(),
  failureCode: varchar("failure_code", { length: 64 }),
}, (table) => [
  index("discipline_asset_cleanup_asset_idx").on(table.privateAssetId, table.attemptedAt),
  check("discipline_asset_cleanup_consistency", sql`(${table.succeeded} = true AND ${table.failureCode} IS NULL) OR (${table.succeeded} = false AND ${table.failureCode} IS NOT NULL)`),
]);
