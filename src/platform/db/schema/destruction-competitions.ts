import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, primaryKey, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { userAccounts } from "./auth";
import { competitionSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const destructionCompetitionStatus = competitionSchema.enum("destruction_competition_status", ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED", "CANCELLED"]);
export const destructionPreliminaryFormat = competitionSchema.enum("destruction_preliminary_format", ["FULL_ROUND_ROBIN_BO3", "FULL_ROUND_ROBIN_BO1", "GROUP_ROUND_ROBIN_BO3", "GROUP_ROUND_ROBIN_BO1", "SWISS_ROUND_BO3", "SWISS_ROUND_BO1", "RANDOM_ROUNDS_BO3", "RANDOM_ROUNDS_BO1"]);
export const destructionApplicationStatus = competitionSchema.enum("destruction_application_status", ["APPLIED", "CONFIRMED", "RESERVE", "REJECTED", "CANCELLED"]);
export const destructionPosition = competitionSchema.enum("destruction_position", ["TOP", "JGL", "MID", "ADC", "SUP"]);
export const destructionOutboxStatus = competitionSchema.enum("destruction_outbox_status", ["PENDING", "DELIVERED", "FAILED"]);

export const destructionCompetitions = competitionSchema.table("destruction_competitions", {
  id: uuid("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  titleNormalized: varchar("title_normalized", { length: 120 }).notNull(),
  status: destructionCompetitionStatus("status").notNull(),
  preliminaryFormat: destructionPreliminaryFormat("preliminary_format").notNull(),
  teamCount: integer("team_count").notNull(),
  participantCount: integer("participant_count").default(0).notNull(),
  aggregateJson: jsonb("aggregate_json").$type<Record<string, unknown>>().notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  createdByUserAccountId: uuid("created_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  updatedByUserAccountId: uuid("updated_by_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
}, (table) => [
  index("destruction_competitions_public_idx").on(table.status, table.updatedAt.desc(), table.id),
  index("destruction_competitions_title_idx").on(table.titleNormalized, table.id),
  check("destruction_competitions_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`),
  check("destruction_competitions_team_count", sql`${table.teamCount} BETWEEN 4 AND 99`),
  check("destruction_competitions_participant_count", sql`${table.participantCount} BETWEEN 0 AND ${table.teamCount} * 5`),
  check("destruction_competitions_revision_positive", sql`${table.revision} > 0`),
  check("destruction_competitions_snapshot_object", sql`jsonb_typeof(${table.aggregateJson}) = 'object'`),
]);

export const destructionApplicationIndex = competitionSchema.table("destruction_application_index", {
  tournamentId: uuid("tournament_id").notNull().references(() => destructionCompetitions.id, { onDelete: "restrict" }),
  applicationId: uuid("application_id").notNull(),
  ownerUserAccountId: uuid("owner_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
  position: destructionPosition("position").notNull(),
  status: destructionApplicationStatus("status").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.tournamentId, table.applicationId] }),
  uniqueIndex("destruction_application_owner_uidx").on(table.tournamentId, table.ownerUserAccountId),
  uniqueIndex("destruction_application_player_uidx").on(table.tournamentId, table.playerId),
  index("destruction_application_owner_idx").on(table.ownerUserAccountId, table.updatedAt.desc()),
]);

export const destructionCommandReceipts = competitionSchema.table("destruction_command_receipts", {
  id: uuid("id").primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => destructionCompetitions.id, { onDelete: "restrict" }),
  actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  scope: varchar("scope", { length: 128 }).notNull(),
  keyHash: bytea("key_hash").notNull(),
  requestHash: bytea("request_hash").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  createdAt: timestamptz("created_at").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (table) => [
  uniqueIndex("destruction_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
  index("destruction_receipts_expires_idx").on(table.expiresAt),
  check("destruction_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
  check("destruction_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
  check("destruction_receipts_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
  check("destruction_receipts_revision_positive", sql`${table.revision} > 0`),
  check("destruction_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const destructionOutbox = competitionSchema.table("destruction_outbox", {
  id: varchar("id", { length: 180 }).primaryKey(),
  requestId: uuid("request_id").notNull(),
  tournamentId: uuid("tournament_id").notNull().references(() => destructionCompetitions.id, { onDelete: "restrict" }),
  aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  status: destructionOutboxStatus("status").default("PENDING").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  createdAt: timestamptz("created_at").notNull(),
  deliveredAt: timestamptz("delivered_at"),
}, (table) => [
  uniqueIndex("destruction_outbox_request_uidx").on(table.requestId),
  uniqueIndex("destruction_outbox_dedupe_uidx").on(table.dedupeKey),
  index("destruction_outbox_pending_idx").on(table.status, table.createdAt, table.id),
  check("destruction_outbox_revision_positive", sql`${table.aggregateRevision} > 0`),
  check("destruction_outbox_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
  check("destruction_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
  check("destruction_outbox_delivery_consistency", sql`(${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL) OR (${table.status} <> 'DELIVERED' AND ${table.deliveredAt} IS NULL)`),
]);
