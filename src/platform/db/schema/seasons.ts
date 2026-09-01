import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
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
import { competitionSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const seasonStatus = competitionSchema.enum("season_status", [
  "DRAFT",
  "ACTIVE",
  "ENDED",
  "RETIRED",
]);
export const seasonApplicationStatus = competitionSchema.enum("season_application_status", [
  "APPLIED",
  "RESERVE",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
]);
export const seasonApplicationSource = competitionSchema.enum("season_application_source", [
  "SITE",
  "KAKAO",
]);
export const seasonApplicationPosition = competitionSchema.enum("season_application_position", [
  "TOP",
  "JGL",
  "MID",
  "ADC",
  "SUP",
  "ALL",
]);

export const seasons = competitionSchema.table(
  "seasons",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    name: varchar("name", { length: 120 }).notNull(),
    nameNormalized: varchar("name_normalized", { length: 120 }).notNull(),
    status: seasonStatus("status").default("DRAFT").notNull(),
    applicationsOpenAt: timestamptz("applications_open_at"),
    applicationsCloseAt: timestamptz("applications_close_at"),
    startsAt: timestamptz("starts_at"),
    endsAt: timestamptz("ends_at"),
    clonedFromSeasonId: uuid("cloned_from_season_id"),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    updatedByUserAccountId: uuid("updated_by_user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamptz("activated_at"),
    endedAt: timestamptz("ended_at"),
    retiredAt: timestamptz("retired_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("seasons_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("seasons_name_normalized_uidx").on(table.nameNormalized),
    uniqueIndex("seasons_single_active_uidx")
      .on(sql`(1)`)
      .where(sql`status = 'ACTIVE'`),
    index("seasons_status_created_at_idx").on(table.status, table.createdAt),
    foreignKey({
      name: "seasons_cloned_from_season_id_fk",
      columns: [table.clonedFromSeasonId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    check("seasons_legacy_id_positive", sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`),
    check("seasons_name_normalized_nonempty", sql`char_length(${table.nameNormalized}) > 0`),
    check("seasons_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "seasons_application_window_order",
      sql`${table.applicationsCloseAt} IS NULL OR ${table.applicationsOpenAt} IS NULL OR ${table.applicationsCloseAt} > ${table.applicationsOpenAt}`,
    ),
    check(
      "seasons_schedule_order",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "seasons_lifecycle_timestamps",
      sql`(
        (${table.status} = 'DRAFT' AND ${table.activatedAt} IS NULL AND ${table.endedAt} IS NULL AND ${table.retiredAt} IS NULL)
        OR (${table.status} = 'ACTIVE' AND ${table.activatedAt} IS NOT NULL AND ${table.endedAt} IS NULL AND ${table.retiredAt} IS NULL)
        OR (${table.status} = 'ENDED' AND ${table.activatedAt} IS NOT NULL AND ${table.endedAt} IS NOT NULL AND ${table.retiredAt} IS NULL)
        OR (${table.status} = 'RETIRED' AND ${table.activatedAt} IS NULL AND ${table.endedAt} IS NULL AND ${table.retiredAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const seasonApplications = competitionSchema.table(
  "season_applications",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    applyDate: date("apply_date", { mode: "string" }).notNull(),
    recruitNo: integer("recruit_no").default(1).notNull(),
    mainPosition: seasonApplicationPosition("main_position").notNull(),
    subPositions: seasonApplicationPosition("sub_positions")
      .array()
      .default(sql`ARRAY[]::competition.season_application_position[]`)
      .notNull(),
    status: seasonApplicationStatus("status").default("APPLIED").notNull(),
    source: seasonApplicationSource("source").default("SITE").notNull(),
    sourceReferenceHash: bytea("source_reference_hash"),
    reviewNote: text("review_note"),
    reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(() => userAccounts.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamptz("reviewed_at"),
    cancelledAt: timestamptz("cancelled_at"),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("season_applications_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("season_applications_identity_slot_uidx").on(
      table.seasonId,
      table.playerId,
      table.applyDate,
      table.recruitNo,
    ),
    index("season_applications_source_reference_hash_idx").on(table.sourceReferenceHash),
    index("season_applications_review_queue_idx").on(
      table.seasonId,
      table.applyDate,
      table.recruitNo,
      table.status,
      table.createdAt,
    ),
    index("season_applications_player_created_at_idx").on(table.playerId, table.createdAt),
    check(
      "season_applications_legacy_id_positive",
      sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`,
    ),
    check("season_applications_recruit_no_positive", sql`${table.recruitNo} > 0`),
    check("season_applications_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "season_applications_source_hash_32_bytes",
      sql`${table.sourceReferenceHash} IS NULL OR octet_length(${table.sourceReferenceHash}) = 32`,
    ),
    check(
      "season_applications_source_hash_consistency",
      sql`(
        (${table.source} = 'SITE' AND ${table.sourceReferenceHash} IS NULL)
        OR (${table.source} = 'KAKAO' AND ${table.sourceReferenceHash} IS NOT NULL)
      )`,
    ),
    check(
      "season_applications_sub_positions_valid",
      sql`(
        cardinality(${table.subPositions}) <= 5
        AND NOT (${table.mainPosition} = ANY(${table.subPositions}))
        AND (
          (${table.mainPosition} = 'ALL' AND cardinality(${table.subPositions}) = 0)
          OR (${table.mainPosition} <> 'ALL' AND NOT ('ALL' = ANY(${table.subPositions})))
        )
        AND cardinality(${table.subPositions}) =
          (case when 'TOP' = ANY(${table.subPositions}) then 1 else 0 end) +
          (case when 'JGL' = ANY(${table.subPositions}) then 1 else 0 end) +
          (case when 'MID' = ANY(${table.subPositions}) then 1 else 0 end) +
          (case when 'ADC' = ANY(${table.subPositions}) then 1 else 0 end) +
          (case when 'SUP' = ANY(${table.subPositions}) then 1 else 0 end) +
          (case when 'ALL' = ANY(${table.subPositions}) then 1 else 0 end)
      )`,
    ),
    check(
      "season_applications_review_consistency",
      sql`(
        (${table.status} IN ('REJECTED', 'RESERVE', 'CONFIRMED') AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedByUserAccountId} IS NOT NULL)
        OR (
          ${table.status} IN ('APPLIED', 'CANCELLED')
          AND ${table.reviewNote} IS NULL
          AND ${table.reviewedAt} IS NULL
          AND ${table.reviewedByUserAccountId} IS NULL
        )
      )`,
    ),
    check(
      "season_applications_cancel_consistency",
      sql`(
        (${table.status} = 'CANCELLED' AND ${table.cancelledAt} IS NOT NULL)
        OR (${table.status} <> 'CANCELLED' AND ${table.cancelledAt} IS NULL)
      )`,
    ),
  ],
);

export const seasonCommandReceipts = competitionSchema.table(
  "season_command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    targetId: uuid("target_id"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("season_command_receipts_actor_scope_key_uidx").on(
      table.actorUserAccountId,
      table.scope,
      table.keyHash,
    ),
    index("season_command_receipts_created_at_idx").on(table.createdAt),
    index("season_command_receipts_expires_at_idx").on(table.expiresAt),
    check("season_command_receipts_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check(
      "season_command_receipts_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check(
      "season_command_receipts_status_range",
      sql`${table.responseStatus} >= 200 AND ${table.responseStatus} < 300`,
    ),
    check("season_command_receipts_expiry_after_creation", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
