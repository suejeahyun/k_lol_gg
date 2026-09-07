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
import { matchGames, matchPosition, matchRecalculationOutbox, matchSeries } from "./matches";
import { mmrSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const mmrProjectionStatus = mmrSchema.enum("projection_status", ["EMPTY", "READY"]);
export const mmrProjectionTrigger = mmrSchema.enum("projection_trigger", [
  "BOOTSTRAP",
  "CATCH_UP",
  "ADMIN",
  "ADJUSTMENT",
]);
export const mmrOutboxStatus = mmrSchema.enum("outbox_status", ["PENDING", "DELIVERED"]);

export const mmrProjectionStates = mmrSchema.table(
  "projection_states",
  {
    key: varchar("key", { length: 16 }).primaryKey(),
    generation: bigint("generation", { mode: "number" }).default(0).notNull(),
    status: mmrProjectionStatus("status").default("EMPTY").notNull(),
    formulaVersion: varchar("formula_version", { length: 48 }),
    sourceMatchCount: integer("source_match_count").default(0).notNull(),
    sourceGameCount: integer("source_game_count").default(0).notNull(),
    sourceAdjustmentCount: integer("source_adjustment_count").default(0).notNull(),
    sourceChecksum: bytea("source_checksum"),
    calculatedAt: timestamptz("calculated_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("mmr_projection_states_global_key", sql`${table.key} = 'GLOBAL'`),
    check("mmr_projection_states_generation_nonnegative", sql`${table.generation} >= 0`),
    check(
      "mmr_projection_states_counts_nonnegative",
      sql`${table.sourceMatchCount} >= 0 AND ${table.sourceGameCount} >= 0 AND ${table.sourceAdjustmentCount} >= 0`,
    ),
    check(
      "mmr_projection_states_lifecycle",
      sql`(
        (${table.status} = 'EMPTY' AND ${table.generation} = 0 AND ${table.formulaVersion} IS NULL AND ${table.sourceChecksum} IS NULL AND ${table.calculatedAt} IS NULL)
        OR
        (${table.status} = 'READY' AND ${table.generation} > 0 AND char_length(${table.formulaVersion}) > 0 AND octet_length(${table.sourceChecksum}) = 32 AND ${table.calculatedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const mmrPlayerProfiles = mmrSchema.table(
  "player_profiles",
  {
    generation: bigint("generation", { mode: "number" }).notNull(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
    overallScoreBp: integer("overall_score_bp").notNull(),
    confidenceBp: integer("confidence_bp").notNull(),
    sampleSize: integer("sample_size").notNull(),
    formulaVersion: varchar("formula_version", { length: 48 }).notNull(),
    calculatedAt: timestamptz("calculated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generation, table.playerId] }),
    index("mmr_player_profiles_generation_score_idx").on(
      table.generation,
      table.overallScoreBp.desc(),
      table.playerId,
    ),
    check("mmr_player_profiles_generation_positive", sql`${table.generation} > 0`),
    check("mmr_player_profiles_score_range", sql`${table.overallScoreBp} BETWEEN 100 AND 10000`),
    check("mmr_player_profiles_confidence_range", sql`${table.confidenceBp} BETWEEN 0 AND 10000`),
    check("mmr_player_profiles_sample_nonnegative", sql`${table.sampleSize} >= 0`),
  ],
);

export const mmrPlayerPositionProfiles = mmrSchema.table(
  "player_position_profiles",
  {
    generation: bigint("generation", { mode: "number" }).notNull(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
    position: matchPosition("position").notNull(),
    scoreBp: integer("score_bp").notNull(),
    sampleSize: integer("sample_size").notNull(),
    calculatedAt: timestamptz("calculated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generation, table.playerId, table.position] }),
    index("mmr_position_profiles_player_generation_idx").on(table.playerId, table.generation),
    check("mmr_position_profiles_generation_positive", sql`${table.generation} > 0`),
    check("mmr_position_profiles_score_range", sql`${table.scoreBp} BETWEEN 100 AND 10000`),
    check("mmr_position_profiles_sample_nonnegative", sql`${table.sampleSize} >= 0`),
  ],
);

export const mmrMatchResultEvents = mmrSchema.table(
  "match_result_events",
  {
    id: uuid("id").primaryKey(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    sourceEventId: uuid("source_event_id").notNull().references(() => matchSeries.id, { onDelete: "restrict" }),
    matchId: uuid("match_id").notNull().references(() => matchSeries.id, { onDelete: "restrict" }),
    gameId: uuid("game_id").notNull().references(() => matchGames.id, { onDelete: "restrict" }),
    gameNumber: integer("game_number").notNull(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
    team: varchar("team", { length: 8 }).notNull(),
    position: matchPosition("position").notNull(),
    won: boolean("won").notNull(),
    expectedWinRateBp: integer("expected_win_rate_bp").notNull(),
    actualPerformanceBp: integer("actual_performance_bp").notNull(),
    overallDeltaBp: integer("overall_delta_bp").notNull(),
    positionDeltaBp: integer("position_delta_bp").notNull(),
    formulaVersion: varchar("formula_version", { length: 48 }).notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("mmr_match_events_generation_game_player_uidx").on(table.generation, table.gameId, table.playerId),
    index("mmr_match_events_player_generation_idx").on(table.playerId, table.generation, table.gameNumber),
    check("mmr_match_events_generation_positive", sql`${table.generation} > 0`),
    check("mmr_match_events_team_allowed", sql`${table.team} IN ('BLUE', 'RED')`),
    check("mmr_match_events_expected_range", sql`${table.expectedWinRateBp} BETWEEN 1 AND 9999`),
    check("mmr_match_events_delta_range", sql`${table.overallDeltaBp} BETWEEN -600 AND 600 AND ${table.positionDeltaBp} BETWEEN -700 AND 700`),
  ],
);

export const mmrManualAdjustments = mmrSchema.table(
  "manual_adjustments",
  {
    id: uuid("id").primaryKey(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "restrict" }),
    position: matchPosition("position"),
    deltaBp: integer("delta_bp").notNull(),
    reasonCode: varchar("reason_code", { length: 64 }).notNull(),
    publicNote: varchar("public_note", { length: 300 }).notNull(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    index("mmr_adjustments_player_created_idx").on(table.playerId, table.createdAt, table.id),
    index("mmr_adjustments_created_idx").on(table.createdAt, table.id),
    check("mmr_adjustments_delta_range", sql`${table.deltaBp} BETWEEN -1000 AND 1000`),
    check("mmr_adjustments_reason_nonempty", sql`char_length(btrim(${table.reasonCode})) BETWEEN 1 AND 64`),
    check("mmr_adjustments_note_nonempty", sql`char_length(btrim(${table.publicNote})) BETWEEN 1 AND 300`),
  ],
);

export const mmrProjectionRuns = mmrSchema.table(
  "projection_runs",
  {
    id: uuid("id").primaryKey(),
    trigger: mmrProjectionTrigger("trigger").notNull(),
    actorUserAccountId: uuid("actor_user_account_id").references(() => userAccounts.id, { onDelete: "restrict" }),
    baseGeneration: bigint("base_generation", { mode: "number" }).notNull(),
    resultGeneration: bigint("result_generation", { mode: "number" }).notNull(),
    sourceMatchCount: integer("source_match_count").notNull(),
    sourceGameCount: integer("source_game_count").notNull(),
    sourceAdjustmentCount: integer("source_adjustment_count").notNull(),
    sourceChecksum: bytea("source_checksum").notNull(),
    startedAt: timestamptz("started_at").notNull(),
    completedAt: timestamptz("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("mmr_projection_runs_generation_uidx").on(table.resultGeneration),
    index("mmr_projection_runs_completed_idx").on(table.completedAt, table.id),
    check("mmr_projection_runs_generation_step", sql`${table.baseGeneration} >= 0 AND ${table.resultGeneration} = ${table.baseGeneration} + 1`),
    check("mmr_projection_runs_counts_nonnegative", sql`${table.sourceMatchCount} >= 0 AND ${table.sourceGameCount} >= 0 AND ${table.sourceAdjustmentCount} >= 0`),
    check("mmr_projection_runs_checksum", sql`octet_length(${table.sourceChecksum}) = 32`),
    check("mmr_projection_runs_time_order", sql`${table.completedAt} >= ${table.startedAt}`),
    check(
      "mmr_projection_runs_actor_consistency",
      sql`(${table.trigger} IN ('ADMIN', 'ADJUSTMENT') AND ${table.actorUserAccountId} IS NOT NULL) OR (${table.trigger} IN ('BOOTSTRAP', 'CATCH_UP') AND ${table.actorUserAccountId} IS NULL)`,
    ),
  ],
);

export const mmrConsumerReceipts = mmrSchema.table(
  "consumer_receipts",
  {
    outboxEventId: uuid("outbox_event_id").primaryKey().references(() => matchRecalculationOutbox.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull().references(() => mmrProjectionRuns.id, { onDelete: "restrict" }),
    generation: bigint("generation", { mode: "number" }).notNull(),
    matchId: uuid("match_id").notNull().references(() => matchSeries.id, { onDelete: "restrict" }),
    matchRevision: bigint("match_revision", { mode: "number" }).notNull(),
    inputDigest: bytea("input_digest").notNull(),
    appliedAt: timestamptz("applied_at").notNull(),
  },
  (table) => [
    index("mmr_consumer_receipts_match_revision_idx").on(table.matchId, table.matchRevision),
    check("mmr_consumer_receipts_generation_positive", sql`${table.generation} > 0`),
    check("mmr_consumer_receipts_revision_nonnegative", sql`${table.matchRevision} >= 0`),
    check("mmr_consumer_receipts_digest", sql`octet_length(${table.inputDigest}) = 32`),
  ],
);

export const mmrCommandReceipts = mmrSchema.table(
  "command_receipts",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: jsonb("response_json").$type<Record<string, unknown>>().notNull(),
    responseEtag: varchar("response_etag", { length: 32 }).notNull(),
    createdAt: timestamptz("created_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("mmr_command_receipts_actor_scope_key_uidx").on(table.actorUserAccountId, table.scope, table.keyHash),
    index("mmr_command_receipts_expires_idx").on(table.expiresAt),
    check("mmr_command_receipts_key_hash", sql`octet_length(${table.keyHash}) = 32`),
    check("mmr_command_receipts_request_hash", sql`octet_length(${table.requestHash}) = 32`),
    check("mmr_command_receipts_status_success", sql`${table.responseStatus} BETWEEN 200 AND 299`),
    check("mmr_command_receipts_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const mmrOutbox = mmrSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull(),
    runId: uuid("run_id").notNull().references(() => mmrProjectionRuns.id, { onDelete: "restrict" }),
    generation: bigint("generation", { mode: "number" }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    status: mmrOutboxStatus("status").default("PENDING").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    deliveredAt: timestamptz("delivered_at"),
  },
  (table) => [
    uniqueIndex("mmr_outbox_request_uidx").on(table.requestId),
    index("mmr_outbox_pending_idx").on(table.status, table.createdAt, table.id),
    check("mmr_outbox_generation_positive", sql`${table.generation} > 0`),
    check("mmr_outbox_delivery", sql`(${table.status} = 'PENDING' AND ${table.deliveredAt} IS NULL) OR (${table.status} = 'DELIVERED' AND ${table.deliveredAt} IS NOT NULL)`),
  ],
);
