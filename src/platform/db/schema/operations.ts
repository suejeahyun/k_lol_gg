import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { operationsSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const aiRequestStatus = operationsSchema.enum("ai_request_status", [
  "DENIED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
]);
export const operationsOutboxStatus = operationsSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);
export const maintenanceRunStatus = operationsSchema.enum("maintenance_run_status", [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

export const siteSettings = operationsSchema.table(
  "site_settings",
  {
    id: integer("id").primaryKey(),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    brandName: varchar("brand_name", { length: 80 }).notNull(),
    tagline: varchar("tagline", { length: 160 }).notNull(),
    supportUrl: varchar("support_url", { length: 500 }),
    featuresJson: jsonb("features_json").$type<Record<string, boolean>>().notNull(),
    aiAllowedRolesJson: jsonb("ai_allowed_roles_json").$type<string[]>().notNull(),
    aiRequestsPerHour: integer("ai_requests_per_hour").default(10).notNull(),
    aiDailyCostLimitMicros: bigint("ai_daily_cost_limit_micros", { mode: "number" }).default(0).notNull(),
    internalMaintenanceNote: varchar("internal_maintenance_note", { length: 2_000 }),
    updatedByUserAccountId: uuid("updated_by_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("site_settings_singleton", sql`${table.id} = 1`),
    check("site_settings_revision_nonnegative", sql`${table.revision} >= 0`),
    check("site_settings_ai_rate_range", sql`${table.aiRequestsPerHour} BETWEEN 1 AND 1000`),
    check("site_settings_ai_cost_range", sql`${table.aiDailyCostLimitMicros} BETWEEN 0 AND 1000000000`),
  ],
);

export const operationsCommandReceipts = operationsSchema.table(
  "command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    responseEtag: varchar("response_etag", { length: 32 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("operations_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
    index("operations_receipts_expires_idx").on(table.expiresAt),
    check("operations_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("operations_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("operations_receipts_status_http", sql`${table.responseStatus} BETWEEN 200 AND 599`),
    check("operations_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const operationsOutbox = operationsSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 128 }).notNull(),
    aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: operationsOutboxStatus("status").default("PENDING").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("operations_outbox_request_uidx").on(table.requestId),
    index("operations_outbox_pending_idx").on(table.status, table.createdAt, table.id),
    check("operations_outbox_revision_nonnegative", sql`${table.aggregateRevision} >= 0`),
    check("operations_outbox_delivery", sql`(${table.status} = 'PENDING' AND ${table.deliveredAt} IS NULL) OR (${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL)`),
  ],
);

export const jobNonceBindings = operationsSchema.table(
  "job_nonce_bindings",
  {
    id: uuid("id").primaryKey(),
    jobName: varchar("job_name", { length: 64 }).notNull(),
    nonceHash: bytea("nonce_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("job_nonce_bindings_job_nonce_uidx").on(table.jobName, table.nonceHash),
    index("job_nonce_bindings_expires_idx").on(table.expiresAt),
    check("job_nonce_bindings_nonce_hash", sql`octet_length(${table.nonceHash}) = 32`),
    check("job_nonce_bindings_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("job_nonce_bindings_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const maintenanceRuns = operationsSchema.table(
  "maintenance_runs",
  {
    id: uuid("id").primaryKey(),
    jobName: varchar("job_name", { length: 64 }).notNull(),
    requestId: uuid("request_id").notNull(),
    status: maintenanceRunStatus("status").notNull(),
    countsJson: jsonb("counts_json").$type<Record<string, number>>().notNull(),
    failureCode: varchar("failure_code", { length: 64 }),
    actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
    startedAt: timestamptz("started_at").notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [
    uniqueIndex("maintenance_runs_request_uidx").on(table.requestId),
    index("maintenance_runs_started_idx").on(table.startedAt, table.id),
    check("maintenance_runs_lifecycle", sql`(${table.status} = 'RUNNING' AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'SUCCEEDED' AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'FAILED' AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)`),
  ],
);

export const aiRequestLedger = operationsSchema.table(
  "ai_request_ledger",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    actorRole: varchar("actor_role", { length: 16 }).notNull(),
    status: aiRequestStatus("status").notNull(),
    promptHash: bytea("prompt_hash").notNull(),
    promptCharCount: integer("prompt_char_count").notNull(),
    outputCharCount: integer("output_char_count").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }).default(0).notNull(),
    adapterKey: varchar("adapter_key", { length: 64 }).notNull(),
    failureCode: varchar("failure_code", { length: 64 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [
    uniqueIndex("ai_request_ledger_request_uidx").on(table.requestId),
    index("ai_request_ledger_actor_created_idx").on(table.actorUserAccountId, table.createdAt),
    index("ai_request_ledger_status_created_idx").on(table.status, table.createdAt),
    check("ai_request_ledger_prompt_hash", sql`octet_length(${table.promptHash}) = 32`),
    check("ai_request_ledger_role", sql`${table.actorRole} IN ('USER', 'ADMIN', 'SUPER_ADMIN')`),
    check("ai_request_ledger_counts_nonnegative", sql`${table.promptCharCount} >= 0 AND ${table.outputCharCount} >= 0 AND ${table.inputTokens} >= 0 AND ${table.outputTokens} >= 0 AND ${table.estimatedCostMicros} >= 0`),
    check("ai_request_ledger_lifecycle", sql`(${table.status} = 'PENDING' AND ${table.completedAt} IS NULL AND ${table.failureCode} IS NULL) OR (${table.status} = 'SUCCEEDED' AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NULL) OR (${table.status} IN ('DENIED', 'FAILED') AND ${table.completedAt} IS NOT NULL AND ${table.failureCode} IS NOT NULL)`),
  ],
);
