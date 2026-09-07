import { sql } from "drizzle-orm";
import {
  bigint,
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
import { competitionSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const eventCompetitionStatus = competitionSchema.enum("event_competition_status", [
  "PLANNED",
  "RECRUITING",
  "TEAM_BUILDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const eventCompetitionFormat = competitionSchema.enum("event_competition_format", ["POSITION", "ARAM"]);
export const eventParticipantStatus = competitionSchema.enum("event_participant_status", ["ACTIVE", "CANCELLED"]);
export const eventParticipantSource = competitionSchema.enum("event_participant_source", [
  "USER_APPLICATION",
  "ADMIN_IMPORT",
  "ADMIN_MANUAL",
]);
export const eventOutboxStatus = competitionSchema.enum("event_outbox_status", ["PENDING", "DELIVERED", "FAILED"]);

/**
 * EventCommandHandler owns the aggregate contract. PostgreSQL stores one
 * revisioned snapshot and a small allowlisted index for public/owner queries;
 * child state is never mutated outside the aggregate transaction.
 */
export const eventCompetitions = competitionSchema.table(
  "event_competitions",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),
    titleNormalized: varchar("title_normalized", { length: 120 }).notNull(),
    description: varchar("description", { length: 2_000 }),
    format: eventCompetitionFormat("format").notNull(),
    status: eventCompetitionStatus("status").notNull(),
    recruitmentOpensAt: timestamptz("recruitment_opens_at").notNull(),
    recruitmentClosesAt: timestamptz("recruitment_closes_at").notNull(),
    bracketBestOf: integer("bracket_best_of").notNull(),
    activeParticipantCount: integer("active_participant_count").default(0).notNull(),
    aggregateJson: jsonb("aggregate_json").$type<Record<string, unknown>>().notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    updatedByUserAccountId: uuid("updated_by_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    index("event_competitions_public_idx").on(table.status, table.recruitmentOpensAt.desc(), table.id),
    index("event_competitions_title_idx").on(table.titleNormalized, table.id),
    check("event_competitions_title_nonempty", sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`),
    check("event_competitions_window_order", sql`${table.recruitmentClosesAt} > ${table.recruitmentOpensAt}`),
    check("event_competitions_best_of", sql`${table.bracketBestOf} BETWEEN 1 AND 9 AND (${table.bracketBestOf} % 2) = 1`),
    check("event_competitions_participant_count", sql`${table.activeParticipantCount} BETWEEN 0 AND 10`),
    check("event_competitions_revision_positive", sql`${table.revision} > 0`),
    check("event_competitions_snapshot_object", sql`jsonb_typeof(${table.aggregateJson}) = 'object'`),
  ],
);

export const eventParticipantIndex = competitionSchema.table(
  "event_participant_index",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventCompetitions.id, { onDelete: "restrict" }),
    participantId: varchar("participant_id", { length: 180 }).notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    ownerUserAccountId: uuid("owner_user_account_id")
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    source: eventParticipantSource("source").notNull(),
    status: eventParticipantStatus("status").notNull(),
    mainPosition: varchar("main_position", { length: 3 }),
    subPositionsJson: jsonb("sub_positions_json").$type<readonly string[]>().notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.participantId] }),
    uniqueIndex("event_participant_event_player_uidx").on(table.eventId, table.playerId),
    uniqueIndex("event_participant_event_owner_uidx")
      .on(table.eventId, table.ownerUserAccountId)
      .where(sql`${table.ownerUserAccountId} IS NOT NULL`),
    index("event_participant_owner_idx").on(table.ownerUserAccountId, table.updatedAt.desc()),
    check("event_participant_sub_positions_array", sql`jsonb_typeof(${table.subPositionsJson}) = 'array' AND jsonb_array_length(${table.subPositionsJson}) <= 4`),
  ],
);

export const eventCommandReceipts = competitionSchema.table(
  "event_command_receipts",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventCompetitions.id, { onDelete: "restrict" }),
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 128 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    createdAt: timestamptz("created_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("event_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
    index("event_receipts_expires_idx").on(table.expiresAt),
    check("event_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("event_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("event_receipts_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
    check("event_receipts_revision_positive", sql`${table.revision} > 0`),
    check("event_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const eventOutbox = competitionSchema.table(
  "event_outbox",
  {
    id: varchar("id", { length: 180 }).primaryKey(),
    requestId: uuid("request_id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventCompetitions.id, { onDelete: "restrict" }),
    aggregateRevision: bigint("aggregate_revision", { mode: "number" }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: eventOutboxStatus("status").default("PENDING").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    createdAt: timestamptz("created_at").notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("event_outbox_request_uidx").on(table.requestId),
    uniqueIndex("event_outbox_dedupe_uidx").on(table.dedupeKey),
    index("event_outbox_pending_idx").on(table.status, table.createdAt, table.id),
    check("event_outbox_revision_positive", sql`${table.aggregateRevision} > 0`),
    check("event_outbox_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
    check("event_outbox_payload_object", sql`jsonb_typeof(${table.payloadJson}) = 'object'`),
    check("event_outbox_delivery_consistency", sql`(${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL) OR (${table.status} <> 'DELIVERED' AND ${table.deliveredAt} IS NULL)`),
  ],
);
