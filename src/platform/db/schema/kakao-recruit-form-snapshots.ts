import { sql } from "drizzle-orm";
import { bigint, check, date, index, jsonb, primaryKey, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import type { JsonObject } from "@/modules/competitions/core/command-contracts";

import { recruitingSchema } from "./namespaces";
import { bytea } from "./primitives";

/** A permanent PARTY identity, scoped to the authorized installation; never an authorization credential. */
export const kakaoRecruitCodes = recruitingSchema.table("kakao_recruit_codes", {
  code: varchar("code", { length: 11 }).primaryKey(),
  scopeHash: bytea("scope_hash").notNull(),
  // Creation issues the code within the party transaction before inserting the
  // party. The application authorizes/locks that UUID; an immediate FK cannot.
  targetId: uuid("target_id").notNull(),
  // Retained after original snapshots expire so an old code@version is never reused.
  lastVersion: bigint("last_version", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("kakao_recruit_codes_target_uidx").on(table.scopeHash, table.targetId),
  check("kakao_recruit_codes_code", sql`${table.code} ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$'`),
  check("kakao_recruit_codes_scope_hash", sql`octet_length(${table.scopeHash}) = 32`),
  check("kakao_recruit_codes_version", sql`${table.lastVersion} BETWEEN 0 AND 9007199254740991`),
]);

/** Immutable, expiring originals; the stable recruitment identity survives their retention cleanup. */
export const kakaoRecruitFormSnapshots = recruitingSchema.table("kakao_recruit_form_snapshots", {
  code: varchar("code", { length: 11 }).notNull().references(() => kakaoRecruitCodes.code, { onDelete: "restrict" }),
  version: bigint("version", { mode: "number" }).notNull(),
  operatingDate: date("operating_date", { mode: "string" }).notNull(),
  stateHash: bytea("state_hash").notNull(),
  stateJson: jsonb("state_json").$type<JsonObject>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.code, table.version] }),
  uniqueIndex("kakao_recruit_form_snapshots_state_uidx").on(table.code, table.operatingDate, table.stateHash),
  index("kakao_recruit_form_snapshots_expiry_idx").on(table.expiresAt, table.code, table.version),
  check("kakao_recruit_form_snapshots_version", sql`${table.version} BETWEEN 1 AND 9007199254740991`),
  check("kakao_recruit_form_snapshots_state_hash", sql`octet_length(${table.stateHash}) = 32`),
  check("kakao_recruit_form_snapshots_state_object", sql`jsonb_typeof(${table.stateJson}) = 'object' AND octet_length(${table.stateJson}::text) <= 65536`),
  check("kakao_recruit_form_snapshots_expiry", sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} = ((${table.operatingDate} + 1)::timestamp + interval '6 hours') AT TIME ZONE 'Asia/Seoul'`),
]);
