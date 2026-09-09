import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { legacySchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

/**
 * Immutable, allowlist-built V1 records which do not have a semantically
 * equivalent V2 aggregate yet. The cutover importer never uses to_jsonb(*) so
 * newly added V1 secrets cannot silently enter this archive.
 */
export const legacyFunctionalRecords = legacySchema.table("functional_records", {
  id: uuid("id").primaryKey(),
  recordKind: varchar("record_kind", { length: 64 }).notNull(),
  sourceTable: varchar("source_table", { length: 64 }).notNull(),
  sourceKey: varchar("source_key", { length: 128 }).notNull(),
  sourceLegacyId: bigint("source_legacy_id", { mode: "number" }).notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  payloadSha256: bytea("payload_sha256").notNull(),
  sourceCreatedAt: timestamptz("source_created_at"),
  sourceUpdatedAt: timestamptz("source_updated_at"),
  importedAt: timestamptz("imported_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("legacy_functional_records_source_uidx").on(table.sourceTable, table.sourceKey),
  index("legacy_functional_records_kind_id_idx").on(table.recordKind, table.sourceLegacyId),
  check("legacy_functional_records_legacy_id_positive", sql`${table.sourceLegacyId} > 0`),
  check("legacy_functional_records_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
  check("legacy_functional_records_payload_sha256", sql`octet_length(${table.payloadSha256}) = 32`),
]);
