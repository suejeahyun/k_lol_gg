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
import { registrySchema } from "./namespaces";
import { bytea } from "./primitives";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const playerStatus = registrySchema.enum("player_status", ["ACTIVE", "INACTIVE"]);
export const playerAccountClaimStatus = registrySchema.enum("player_account_claim_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const players = registrySchema.table(
  "players",
  {
    id: uuid("id").primaryKey(),
    legacyId: integer("legacy_id"),
    userAccountId: uuid("user_account_id").references(() => userAccounts.id, {
      onDelete: "set null",
    }),
    memberName: varchar("member_name", { length: 100 }).notNull(),
    memberNameNormalized: varchar("member_name_normalized", { length: 100 }).notNull(),
    nickname: varchar("nickname", { length: 64 }).notNull(),
    nicknameNormalized: varchar("nickname_normalized", { length: 64 }).notNull(),
    tagLine: varchar("tag_line", { length: 32 }).notNull(),
    tagLineNormalized: varchar("tag_line_normalized", { length: 32 }).notNull(),
    peakTier: varchar("peak_tier", { length: 32 }),
    currentTier: varchar("current_tier", { length: 32 }),
    status: playerStatus("status").default("ACTIVE").notNull(),
    deactivatedAt: timestamptz("deactivated_at"),
    accountLifecycleDeactivatedAt: timestamptz("account_lifecycle_deactivated_at"),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("players_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("players_user_account_id_uidx").on(table.userAccountId),
    uniqueIndex("players_id_user_account_uidx").on(table.id, table.userAccountId),
    uniqueIndex("players_nickname_tag_line_normalized_uidx").on(
      table.nicknameNormalized,
      table.tagLineNormalized,
    ),
    index("players_status_updated_at_idx").on(table.status, table.updatedAt),
    index("players_nickname_normalized_idx").on(table.nicknameNormalized),
    index("players_tag_line_normalized_idx").on(table.tagLineNormalized),
    index("players_member_name_normalized_idx").on(table.memberNameNormalized),
    check("players_member_name_normalized_nonempty", sql`char_length(${table.memberNameNormalized}) > 0`),
    check("players_nickname_normalized_nonempty", sql`char_length(${table.nicknameNormalized}) > 0`),
    check("players_tag_line_normalized_nonempty", sql`char_length(${table.tagLineNormalized}) > 0`),
    check("players_legacy_id_positive", sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`),
    check("players_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "players_status_deactivated_consistency",
      sql`(
        (${table.status} = 'ACTIVE' AND ${table.deactivatedAt} IS NULL)
        OR
        (${table.status} = 'INACTIVE' AND ${table.deactivatedAt} IS NOT NULL)
      )`,
    ),
    check(
      "players_account_lifecycle_deactivation_consistency",
      sql`${table.accountLifecycleDeactivatedAt} IS NULL OR (${table.status} = 'INACTIVE' AND ${table.deactivatedAt} IS NOT NULL)`,
    ),
  ],
);

export const playerMutationReceipts = registrySchema.table(
  "player_mutation_receipts",
  {
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
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
    uniqueIndex("player_mutation_receipts_actor_scope_key_uidx").on(
      table.actorUserAccountId,
      table.scope,
      table.keyHash,
    ),
    index("player_mutation_receipts_expires_at_idx").on(table.expiresAt),
    check("player_mutation_receipts_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check(
      "player_mutation_receipts_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check(
      "player_mutation_receipts_status_success",
      sql`${table.responseStatus} >= 200 AND ${table.responseStatus} <= 299`,
    ),
    check(
      "player_mutation_receipts_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const playerAccountClaims = registrySchema.table(
  "player_account_claims",
  {
    id: uuid("id").primaryKey(),
    userAccountId: uuid("user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    requestedMemberName: varchar("requested_member_name", { length: 100 }).notNull(),
    requestedRiotId: varchar("requested_riot_id", { length: 97 }).notNull(),
    status: playerAccountClaimStatus("status").default("PENDING").notNull(),
    reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "restrict" },
    ),
    reviewedAt: timestamptz("reviewed_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("player_account_claims_pending_account_uidx")
      .on(table.userAccountId)
      .where(sql`${table.status} = 'PENDING'`),
    uniqueIndex("player_account_claims_pending_player_uidx")
      .on(table.playerId)
      .where(sql`${table.status} = 'PENDING'`),
    index("player_account_claims_account_updated_idx")
      .on(table.userAccountId, table.updatedAt.desc(), table.id),
    index("player_account_claims_status_created_idx").on(table.status, table.createdAt),
    check(
      "player_account_claims_review_consistency",
      sql`(
        (${table.status} = 'PENDING' AND ${table.reviewedAt} IS NULL AND ${table.reviewedByUserAccountId} IS NULL)
        OR
        (${table.status} <> 'PENDING' AND ${table.reviewedAt} IS NOT NULL AND ${table.reviewedByUserAccountId} IS NOT NULL)
      )`,
    ),
  ],
);
