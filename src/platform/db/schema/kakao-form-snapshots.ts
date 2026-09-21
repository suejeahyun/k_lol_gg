import { sql } from "drizzle-orm";
import { check, date, index, jsonb, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import type { JsonObject } from "@/modules/competitions/core/command-contracts";

import { recruitingSchema } from "./namespaces";
import { bytea } from "./primitives";

/** Short-lived copy-form originals. A code identifies a version, never authorizes a write. */
export const kakaoFormSnapshots = recruitingSchema.table("kakao_form_snapshots", {
  code: varchar("code", { length: 11 }).primaryKey(),
  kind: varchar("kind", { length: 8 }).$type<"PARTY" | "INHOUSE">().notNull(),
  scopeHash: bytea("scope_hash").notNull(),
  targetId: varchar("target_id", { length: 160 }).notNull(),
  operatingDate: date("operating_date", { mode: "string" }).notNull(),
  stateHash: bytea("state_hash").notNull(),
  stateJson: jsonb("state_json").$type<JsonObject>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("kakao_form_snapshots_state_uidx").on(table.kind, table.scopeHash, table.targetId, table.operatingDate, table.stateHash),
  index("kakao_form_snapshots_expiry_idx").on(table.expiresAt, table.code),
  check("kakao_form_snapshots_code", sql`${table.code} ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$'`),
  check("kakao_form_snapshots_kind", sql`${table.kind} IN ('PARTY', 'INHOUSE')`),
  check("kakao_form_snapshots_scope_hash", sql`octet_length(${table.scopeHash}) = 32`),
  check("kakao_form_snapshots_target", sql`char_length(btrim(${table.targetId})) BETWEEN 1 AND 160`),
  check("kakao_form_snapshots_state_hash", sql`octet_length(${table.stateHash}) = 32`),
  check("kakao_form_snapshots_state_object", sql`jsonb_typeof(${table.stateJson}) = 'object' AND octet_length(${table.stateJson}::text) <= 65536`),
  check("kakao_form_snapshots_expiry", sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} = ((${table.operatingDate} + 1)::timestamp + interval '6 hours') AT TIME ZONE 'Asia/Seoul'`),
]);
