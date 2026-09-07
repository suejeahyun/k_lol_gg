import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { catalogSchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const championCatalogStatus = catalogSchema.enum("champion_catalog_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const championCatalog = catalogSchema.table(
  "champions",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    status: championCatalogStatus("status").default("ACTIVE").notNull(),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("champion_catalog_status_key_idx").on(table.status, table.key),
    check("champion_catalog_key_canonical", sql`${table.key} ~ '^[a-z0-9][a-z0-9._-]{0,63}$'`),
    check("champion_catalog_display_name_nonempty", sql`char_length(${table.displayName}) > 0`),
    check("champion_catalog_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);

export const championCommandReceipts = catalogSchema.table(
  "champion_command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 128 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    bodyDigestHex: varchar("body_digest_hex", { length: 64 }).notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("champion_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
    index("champion_receipts_expires_idx").on(table.expiresAt),
    check("champion_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("champion_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("champion_receipts_body_digest", sql`${table.bodyDigestHex} ~ '^[a-f0-9]{64}$'`),
    check("champion_receipts_status", sql`${table.responseStatus} BETWEEN 200 AND 299`),
    check("champion_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const championOutbox = catalogSchema.table(
  "champion_outbox",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull(),
    championKey: varchar("champion_key", { length: 64 }).notNull().references(() => championCatalog.key, { onDelete: "restrict" }),
    aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("champion_outbox_request_event_uidx").on(table.requestId, table.eventType),
    uniqueIndex("champion_outbox_dedupe_uidx").on(table.dedupeKey),
    index("champion_outbox_pending_idx").on(table.createdAt, table.id).where(sql`${table.deliveredAt} IS NULL`),
    check("champion_outbox_revision", sql`${table.aggregateRevision} >= 0`),
    check("champion_outbox_payload", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
  ],
);
