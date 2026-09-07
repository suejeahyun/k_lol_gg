import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { championCatalog } from "./catalog";
import { matchPosition, matchRecalculationOutbox, matchSeries } from "./matches";
import { statisticsSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";
import { seasons } from "./seasons";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const seasonProjectionStatus = statisticsSchema.enum("season_projection_status", [
  "EMPTY",
  "READY",
]);

export const statisticsProjectionRunStatus = statisticsSchema.enum(
  "statistics_projection_run_status",
  ["RUNNING", "SUCCEEDED", "FAILED"],
);

export const statisticsProjectionRunTrigger = statisticsSchema.enum(
  "statistics_projection_run_trigger",
  ["OUTBOX", "ADMIN", "BOOTSTRAP"],
);

/**
 * One authoritative publication pointer per season. Rebuilds write every row for the
 * next generation and advance this state in the same transaction. Failed attempts
 * are recorded in projection_runs without replacing the last READY generation.
 */
export const seasonProjectionStates = statisticsSchema.table(
  "season_projection_states",
  {
    seasonId: uuid("season_id")
      .primaryKey()
      .references(() => seasons.id, { onDelete: "cascade" }),
    generation: bigint("generation", { mode: "number" }).default(0).notNull(),
    status: seasonProjectionStatus("status").default("EMPTY").notNull(),
    sourceMatchCount: integer("source_match_count").default(0).notNull(),
    sourceGameCount: integer("source_game_count").default(0).notNull(),
    sourceParticipantCount: integer("source_participant_count").default(0).notNull(),
    sourceChecksum: bytea("source_checksum"),
    calculatedAt: timestamptz("calculated_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("season_projection_states_status_updated_idx").on(table.status, table.updatedAt),
    check("season_projection_states_generation_nonnegative", sql`${table.generation} >= 0`),
    check(
      "season_projection_states_source_counts_nonnegative",
      sql`${table.sourceMatchCount} >= 0 AND ${table.sourceGameCount} >= 0 AND ${table.sourceParticipantCount} >= 0`,
    ),
    check(
      "season_projection_states_lifecycle_consistency",
      sql`(
        (${table.status} = 'EMPTY' AND ${table.generation} = 0 AND ${table.sourceChecksum} IS NULL AND ${table.calculatedAt} IS NULL)
        OR
        (${table.status} = 'READY' AND ${table.generation} > 0 AND ${table.sourceChecksum} IS NOT NULL AND octet_length(${table.sourceChecksum}) = 32 AND ${table.calculatedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const playerSeasonStats = statisticsSchema.table(
  "player_season_stats",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    generation: bigint("generation", { mode: "number" }).notNull(),
    totalGames: integer("total_games").notNull(),
    participationCount: integer("participation_count").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    mvpCount: integer("mvp_count").notNull(),
    calculatedAt: timestamptz("calculated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.playerId] }),
    index("player_season_stats_ranking_idx").on(
      table.seasonId,
      table.participationCount,
      table.wins,
      table.totalGames,
      table.mvpCount,
      table.playerId,
    ),
    check("player_season_stats_generation_positive", sql`${table.generation} > 0`),
    check(
      "player_season_stats_counts_nonnegative",
      sql`${table.totalGames} >= 0 AND ${table.participationCount} >= 0 AND ${table.wins} >= 0 AND ${table.losses} >= 0 AND ${table.mvpCount} >= 0`,
    ),
    check(
      "player_season_stats_win_loss_total",
      sql`${table.wins} + ${table.losses} = ${table.totalGames}`,
    ),
    check(
      "player_season_stats_participation_bounded",
      sql`${table.participationCount} <= ${table.totalGames}`,
    ),
    check("player_season_stats_mvp_bounded", sql`${table.mvpCount} <= ${table.totalGames}`),
  ],
);

export const playerChampionStats = statisticsSchema.table(
  "player_champion_stats",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    championKey: varchar("champion_key", { length: 64 })
      .notNull()
      .references(() => championCatalog.key, { onDelete: "restrict" }),
    generation: bigint("generation", { mode: "number" }).notNull(),
    games: integer("games").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    mvpCount: integer("mvp_count").notNull(),
    calculatedAt: timestamptz("calculated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.playerId, table.championKey] }),
    index("player_champion_stats_player_games_idx").on(
      table.playerId,
      table.seasonId,
      table.games,
      table.championKey,
    ),
    index("player_champion_stats_champion_idx").on(table.championKey, table.seasonId),
    check("player_champion_stats_generation_positive", sql`${table.generation} > 0`),
    check(
      "player_champion_stats_counts_nonnegative",
      sql`${table.games} >= 0 AND ${table.wins} >= 0 AND ${table.losses} >= 0 AND ${table.mvpCount} >= 0`,
    ),
    check("player_champion_stats_win_loss_total", sql`${table.wins} + ${table.losses} = ${table.games}`),
    check("player_champion_stats_mvp_bounded", sql`${table.mvpCount} <= ${table.games}`),
  ],
);

export const playerPositionStats = statisticsSchema.table(
  "player_position_stats",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    position: matchPosition("position").notNull(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    games: integer("games").notNull(),
    wins: integer("wins").notNull(),
    losses: integer("losses").notNull(),
    calculatedAt: timestamptz("calculated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.seasonId, table.playerId, table.position] }),
    index("player_position_stats_player_games_idx").on(
      table.playerId,
      table.seasonId,
      table.games,
      table.position,
    ),
    check("player_position_stats_generation_positive", sql`${table.generation} > 0`),
    check(
      "player_position_stats_counts_nonnegative",
      sql`${table.games} >= 0 AND ${table.wins} >= 0 AND ${table.losses} >= 0`,
    ),
    check("player_position_stats_win_loss_total", sql`${table.wins} + ${table.losses} = ${table.games}`),
  ],
);

export const statisticsProjectionRuns = statisticsSchema.table(
  "projection_runs",
  {
    id: uuid("id").primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    trigger: statisticsProjectionRunTrigger("trigger").notNull(),
    status: statisticsProjectionRunStatus("status").default("RUNNING").notNull(),
    requestedOutboxEventId: uuid("requested_outbox_event_id").references(
      () => matchRecalculationOutbox.id,
      { onDelete: "restrict" },
    ),
    baseGeneration: bigint("base_generation", { mode: "number" }).notNull(),
    resultGeneration: bigint("result_generation", { mode: "number" }),
    sourceMatchCount: integer("source_match_count").default(0).notNull(),
    sourceGameCount: integer("source_game_count").default(0).notNull(),
    sourceParticipantCount: integer("source_participant_count").default(0).notNull(),
    sourceChecksum: bytea("source_checksum"),
    failureCode: varchar("failure_code", { length: 64 }),
    startedAt: timestamptz("started_at").defaultNow().notNull(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [
    uniqueIndex("projection_runs_outbox_season_uidx")
      .on(table.requestedOutboxEventId, table.seasonId)
      .where(sql`${table.requestedOutboxEventId} IS NOT NULL`),
    index("projection_runs_season_started_idx").on(table.seasonId, table.startedAt, table.id),
    index("projection_runs_status_started_idx").on(table.status, table.startedAt),
    check("projection_runs_base_generation_nonnegative", sql`${table.baseGeneration} >= 0`),
    check(
      "projection_runs_source_counts_nonnegative",
      sql`${table.sourceMatchCount} >= 0 AND ${table.sourceGameCount} >= 0 AND ${table.sourceParticipantCount} >= 0`,
    ),
    check(
      "projection_runs_trigger_source_consistency",
      sql`(${table.trigger} = 'OUTBOX' AND ${table.requestedOutboxEventId} IS NOT NULL) OR (${table.trigger} IN ('ADMIN', 'BOOTSTRAP') AND ${table.requestedOutboxEventId} IS NULL)`,
    ),
    check(
      "projection_runs_lifecycle_consistency",
      sql`(
        (${table.status} = 'RUNNING' AND ${table.resultGeneration} IS NULL AND ${table.sourceChecksum} IS NULL AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NULL)
        OR
        (${table.status} = 'SUCCEEDED' AND ${table.resultGeneration} = ${table.baseGeneration} + 1 AND ${table.sourceChecksum} IS NOT NULL AND octet_length(${table.sourceChecksum}) = 32 AND ${table.failureCode} IS NULL AND ${table.completedAt} IS NOT NULL)
        OR
        (${table.status} = 'FAILED' AND ${table.resultGeneration} IS NULL AND ${table.sourceChecksum} IS NULL AND ${table.failureCode} IS NOT NULL AND char_length(${table.failureCode}) BETWEEN 1 AND 64 AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const matchProjectionReceipts = statisticsSchema.table(
  "match_projection_receipts",
  {
    outboxEventId: uuid("outbox_event_id")
      .primaryKey()
      .references(() => matchRecalculationOutbox.id, { onDelete: "restrict" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matchSeries.id, { onDelete: "restrict" }),
    matchRevision: bigint("match_revision", { mode: "number" }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    oldSeasonId: uuid("old_season_id").references(() => seasons.id, { onDelete: "restrict" }),
    newSeasonId: uuid("new_season_id").references(() => seasons.id, { onDelete: "restrict" }),
    inputDigest: bytea("input_digest").notNull(),
    appliedAt: timestamptz("applied_at").defaultNow().notNull(),
  },
  (table) => [
    index("match_projection_receipts_match_revision_idx").on(table.matchId, table.matchRevision),
    check("match_projection_receipts_revision_nonnegative", sql`${table.matchRevision} >= 0`),
    check("match_projection_receipts_digest_32_bytes", sql`octet_length(${table.inputDigest}) = 32`),
    check(
      "match_projection_receipts_action_allowed",
      sql`${table.action} IN ('CREATED', 'AMENDED', 'PUBLISHED', 'VOIDED', 'RESTORED')`,
    ),
  ],
);
