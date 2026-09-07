import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
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
import { championCatalog } from "./catalog";
import { assetsSchema, competitionSchema } from "./namespaces";
import { bytea } from "./primitives";
import { players } from "./registry";
import { seasons } from "./seasons";

const timestamptz = (name: string) => timestamp(name, { mode: "date", withTimezone: true });

export const matchSeriesStatus = competitionSchema.enum("match_series_status", [
  "DRAFT",
  "PUBLISHED",
  "VOIDED",
]);
export const matchTeam = competitionSchema.enum("match_team", ["BLUE", "RED"]);
export const matchPosition = competitionSchema.enum("match_position", [
  "TOP",
  "JGL",
  "MID",
  "ADC",
  "SUP",
]);
export const matchSubmissionStatus = competitionSchema.enum("match_submission_status", [
  "AWAITING_UPLOAD",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);
export const matchSubmissionSource = competitionSchema.enum("match_submission_source", [
  "WEB",
  "KAKAO",
  "ADMIN",
]);
export const matchSubmissionImageOcrStatus = competitionSchema.enum(
  "match_submission_image_ocr_status",
  ["NOT_REQUESTED", "PENDING", "SUCCEEDED", "FAILED"],
);
export const matchOutboxStatus = competitionSchema.enum("match_outbox_status", [
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "FAILED",
]);
export const matchRateLimitScope = competitionSchema.enum("match_rate_limit_scope", [
  "SUBMISSION_CREATE",
  "SUBMISSION_UPDATE",
  "IMAGE_UPLOAD",
  "ADMIN_MUTATION",
]);
export const matchUploadReservationStatus = competitionSchema.enum(
  "match_upload_reservation_status",
  ["RESERVED", "STAGED", "FINALIZED", "DELETE_PENDING", "CANCELLED"],
);
export const matchOcrReservationStatus = competitionSchema.enum(
  "match_ocr_reservation_status",
  ["RESERVED", "FINALIZED", "FAILED"],
);
export const privateAssetStatus = assetsSchema.enum("private_asset_status", [
  "STAGED",
  "READY",
  "DELETE_PENDING",
]);
export const privateAssetIngestSource = assetsSchema.enum("private_asset_ingest_source", [
  "WEB_USER",
  "ADMIN",
  "KAKAO_SERVICE",
  "JOB",
]);

export const matchSeries = competitionSchema.table(
  "match_series",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    // S06 may add a foreign key once the team-balance aggregate is introduced.
    teamBalanceDraftId: uuid("team_balance_draft_id"),
    title: varchar("title", { length: 160 }).notNull(),
    titleNormalized: varchar("title_normalized", { length: 160 }).notNull(),
    playedOn: date("played_on", { mode: "string" }).notNull(),
    startedAt: timestamptz("started_at"),
    startedAtOffsetMinutes: integer("started_at_offset_minutes"),
    blueWins: integer("blue_wins").notNull(),
    redWins: integer("red_wins").notNull(),
    gameCount: integer("game_count").notNull(),
    status: matchSeriesStatus("status").default("DRAFT").notNull(),
    voidReason: text("void_reason"),
    voidedAt: timestamptz("voided_at"),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdByUserAccountId: uuid("created_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "set null" },
    ),
    updatedByUserAccountId: uuid("updated_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "set null" },
    ),
    publishedAt: timestamptz("published_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_series_legacy_id_uidx").on(table.legacyId),
    index("match_series_public_list_idx").on(table.status, table.playedOn, table.startedAt, table.id),
    index("match_series_public_title_idx").on(table.status, table.titleNormalized, table.id),
    index("match_series_public_winner_idx").on(
      table.status,
      table.blueWins,
      table.redWins,
      table.playedOn,
      table.id,
    ),
    index("match_series_title_trgm_idx").using(
      "gin",
      table.titleNormalized.asc().op("gin_trgm_ops"),
    ),
    index("match_series_season_played_on_idx").on(table.seasonId, table.playedOn, table.id),
    index("match_series_team_balance_draft_idx").on(table.teamBalanceDraftId),
    index("match_series_title_normalized_idx").on(table.titleNormalized),
    check(
      "match_series_legacy_id_int32",
      sql`${table.legacyId} IS NULL OR ${table.legacyId} BETWEEN 1 AND 2147483647`,
    ),
    check("match_series_title_normalized_nonempty", sql`char_length(${table.titleNormalized}) > 0`),
    check("match_series_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "match_series_result_summary",
      sql`${table.gameCount} BETWEEN 1 AND 9 AND ${table.blueWins} >= 0 AND ${table.redWins} >= 0 AND ${table.blueWins} + ${table.redWins} = ${table.gameCount}`,
    ),
    check(
      "match_series_started_at_offset_consistency",
      sql`(${table.startedAt} IS NULL AND ${table.startedAtOffsetMinutes} IS NULL) OR (${table.startedAt} IS NOT NULL AND ${table.startedAtOffsetMinutes} BETWEEN -840 AND 840)`,
    ),
    check(
      "match_series_lifecycle_consistency",
      sql`(
        (${table.status} = 'DRAFT' AND ${table.publishedAt} IS NULL AND ${table.voidedAt} IS NULL AND ${table.voidReason} IS NULL)
        OR (${table.status} = 'PUBLISHED' AND ${table.publishedAt} IS NOT NULL AND ${table.voidedAt} IS NULL AND ${table.voidReason} IS NULL)
        OR (${table.status} = 'VOIDED' AND ${table.publishedAt} IS NOT NULL AND ${table.voidedAt} IS NOT NULL AND char_length(${table.voidReason}) BETWEEN 3 AND 1000)
      )`,
    ),
  ],
);

export const matchGames = competitionSchema.table(
  "match_games",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => matchSeries.id, { onDelete: "restrict" }),
    gameNumber: integer("game_number").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    winnerTeam: matchTeam("winner_team").notNull(),
    mvpPlayerId: uuid("mvp_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    mvpScoreUnits2: integer("mvp_score_units_2").notNull(),
    mvpFormulaVersion: varchar("mvp_formula_version", { length: 32 }).notNull(),
    mvpSelection: varchar("mvp_selection", { length: 64 }).notNull(),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_games_series_game_number_uidx").on(table.seriesId, table.gameNumber),
    index("match_games_series_idx").on(table.seriesId, table.gameNumber),
    check("match_games_game_number_range", sql`${table.gameNumber} BETWEEN 1 AND 9`),
    check("match_games_duration_range", sql`${table.durationSeconds} BETWEEN 60 AND 7200`),
    check("match_games_mvp_score_range", sql`${table.mvpScoreUnits2} BETWEEN -4000 AND 10000`),
    check("match_games_mvp_formula_v1", sql`${table.mvpFormulaVersion} = 'V1_COMPAT_1'`),
    check("match_games_mvp_selection_v1", sql`${table.mvpSelection} = 'WINNER_SCORE_KDA_PLAYER_ID_V1'`),
    check("match_games_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);

export const matchParticipants = competitionSchema.table(
  "match_participants",
  {
    id: uuid("id").primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => matchGames.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    nicknameSnapshot: varchar("nickname_snapshot", { length: 64 }).notNull(),
    tagLineSnapshot: varchar("tag_line_snapshot", { length: 32 }).notNull(),
    championKey: varchar("champion_key", { length: 64 })
      .notNull()
      .references(() => championCatalog.key, { onDelete: "restrict" }),
    team: matchTeam("team").notNull(),
    position: matchPosition("position").notNull(),
    kills: integer("kills").notNull(),
    deaths: integer("deaths").notNull(),
    assists: integer("assists").notNull(),
    mvpScoreUnits2: integer("mvp_score_units_2").notNull(),
    mvpFormulaVersion: varchar("mvp_formula_version", { length: 32 }).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_participants_game_player_uidx").on(table.gameId, table.playerId),
    uniqueIndex("match_participants_game_champion_uidx").on(table.gameId, table.championKey),
    uniqueIndex("match_participants_game_team_position_uidx").on(
      table.gameId,
      table.team,
      table.position,
    ),
    index("match_participants_player_game_idx").on(table.playerId, table.gameId),
    index("match_participants_champion_idx").on(table.championKey, table.gameId),
    check("match_participants_nickname_snapshot_nonempty", sql`char_length(${table.nicknameSnapshot}) > 0`),
    check("match_participants_tag_line_snapshot_nonempty", sql`char_length(${table.tagLineSnapshot}) > 0`),
    check("match_participants_champion_nonempty", sql`char_length(${table.championKey}) > 0`),
    check(
      "match_participants_kda_range",
      sql`${table.kills} BETWEEN 0 AND 999 AND ${table.deaths} BETWEEN 0 AND 999 AND ${table.assists} BETWEEN 0 AND 999`,
    ),
    check("match_participants_mvp_formula_v1", sql`${table.mvpFormulaVersion} = 'V1_COMPAT_1'`),
    check("match_participants_mvp_score_range", sql`${table.mvpScoreUnits2} BETWEEN -4000 AND 10000`),
  ],
);

export const matchSubmissions = competitionSchema.table(
  "match_submissions",
  {
    id: uuid("id").primaryKey(),
    legacyId: bigint("legacy_id", { mode: "number" }),
    publicCode: varchar("public_code", { length: 24 }).notNull(),
    ownerUserAccountId: uuid("owner_user_account_id").references(() => userAccounts.id, {
      onDelete: "restrict",
    }),
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    organizer: varchar("organizer", { length: 100 }).notNull(),
    seriesNumber: integer("series_number").notNull(),
    note: text("note"),
    playedOn: date("played_on", { mode: "string" }).notNull(),
    startedAt: timestamptz("started_at"),
    startedAtOffsetMinutes: integer("started_at_offset_minutes"),
    expectedGameCount: integer("expected_game_count").notNull(),
    teamBalanceDraftId: uuid("team_balance_draft_id"),
    source: matchSubmissionSource("source").default("WEB").notNull(),
    sourceReferenceHash: bytea("source_reference_hash").notNull(),
    provenanceJson: jsonb("provenance_json").$type<Record<string, unknown>>(),
    reviewedResultJson: jsonb("reviewed_result_json").$type<Record<string, unknown>>(),
    status: matchSubmissionStatus("status").default("AWAITING_UPLOAD").notNull(),
    publicReviewReason: text("public_review_reason"),
    reviewedByUserAccountId: uuid("reviewed_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "restrict" },
    ),
    reviewedAt: timestamptz("reviewed_at"),
    cancelledAt: timestamptz("cancelled_at"),
    approvedMatchSeriesId: uuid("approved_match_series_id").references(() => matchSeries.id, {
      onDelete: "restrict",
    }),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_submissions_legacy_id_uidx").on(table.legacyId),
    uniqueIndex("match_submissions_public_code_uidx").on(table.publicCode),
    uniqueIndex("match_submissions_approved_match_uidx").on(table.approvedMatchSeriesId),
    uniqueIndex("match_submissions_web_owner_source_reference_uidx")
      .on(table.ownerUserAccountId, table.sourceReferenceHash)
      .where(sql`${table.source} = 'WEB'`),
    uniqueIndex("match_submissions_kakao_source_reference_uidx")
      .on(table.sourceReferenceHash)
      .where(sql`${table.source} = 'KAKAO'`),
    uniqueIndex("match_submissions_admin_source_reference_uidx")
      .on(table.sourceReferenceHash)
      .where(sql`${table.source} = 'ADMIN'`),
    index("match_submissions_owner_status_idx").on(
      table.ownerUserAccountId,
      table.status,
      table.updatedAt,
    ),
    index("match_submissions_review_queue_idx").on(table.status, table.createdAt, table.id),
    index("match_submissions_season_played_on_idx").on(table.seasonId, table.playedOn),
    index("match_submissions_title_trgm_idx").using(
      "gin",
      table.title.asc().op("gin_trgm_ops"),
    ),
    index("match_submissions_organizer_trgm_idx").using(
      "gin",
      table.organizer.asc().op("gin_trgm_ops"),
    ),
    index("match_submissions_public_code_trgm_idx").using(
      "gin",
      table.publicCode.asc().op("gin_trgm_ops"),
    ),
    check(
      "match_submissions_legacy_id_positive",
      sql`${table.legacyId} IS NULL OR ${table.legacyId} BETWEEN 1 AND 2147483647`,
    ),
    check("match_submissions_public_code_nonempty", sql`char_length(${table.publicCode}) >= 12`),
    check("match_submissions_series_number_positive", sql`${table.seriesNumber} > 0`),
    check(
      "match_submissions_game_count_source_contract",
      sql`(${table.source} IN ('WEB', 'KAKAO') AND ${table.expectedGameCount} IN (2, 3)) OR (${table.source} = 'ADMIN' AND ${table.expectedGameCount} = 1)`,
    ),
    check("match_submissions_source_reference_32_bytes", sql`octet_length(${table.sourceReferenceHash}) = 32`),
    check(
      "match_submissions_source_owner_consistency",
      sql`(${table.source} = 'WEB' AND ${table.ownerUserAccountId} IS NOT NULL) OR (${table.source} IN ('KAKAO', 'ADMIN') AND ${table.ownerUserAccountId} IS NULL)`,
    ),
    check("match_submissions_note_size", sql`${table.note} IS NULL OR char_length(${table.note}) <= 1000`),
    check(
      "match_submissions_provenance_size",
      sql`${table.provenanceJson} IS NULL OR octet_length(${table.provenanceJson}::text) <= 16384`,
    ),
    check("match_submissions_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "match_submissions_reviewed_result_size",
      sql`${table.reviewedResultJson} IS NULL OR octet_length(${table.reviewedResultJson}::text) <= 262144`,
    ),
    check(
      "match_submissions_started_at_offset_consistency",
      sql`(${table.startedAt} IS NULL AND ${table.startedAtOffsetMinutes} IS NULL) OR (${table.startedAt} IS NOT NULL AND ${table.startedAtOffsetMinutes} BETWEEN -840 AND 840)`,
    ),
    check(
      "match_submissions_review_consistency",
      sql`(
        (${table.status} IN ('AWAITING_UPLOAD', 'PENDING_REVIEW') AND ${table.publicReviewReason} IS NULL AND ${table.reviewedByUserAccountId} IS NULL AND ${table.reviewedAt} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.approvedMatchSeriesId} IS NULL)
        OR (${table.status} = 'REJECTED' AND char_length(${table.publicReviewReason}) BETWEEN 3 AND 1000 AND ${table.reviewedByUserAccountId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.approvedMatchSeriesId} IS NULL)
        OR (${table.status} = 'APPROVED' AND ${table.reviewedByUserAccountId} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.approvedMatchSeriesId} IS NOT NULL)
        OR (${table.status} = 'CANCELLED' AND ${table.publicReviewReason} IS NULL AND ${table.reviewedByUserAccountId} IS NULL AND ${table.reviewedAt} IS NULL AND ${table.cancelledAt} IS NOT NULL AND ${table.approvedMatchSeriesId} IS NULL)
      )`,
    ),
  ],
);

export const privateAssets = assetsSchema.table(
  "private_assets",
  {
    id: uuid("id").primaryKey(),
    createdByUserAccountId: uuid("created_by_user_account_id").references(() => userAccounts.id, {
      onDelete: "restrict",
    }),
    ingestSource: privateAssetIngestSource("ingest_source").notNull(),
    storageProvider: varchar("storage_provider", { length: 32 }).notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: bytea("sha256").notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    status: privateAssetStatus("status").default("STAGED").notNull(),
    readyAt: timestamptz("ready_at"),
    deleteRequestedAt: timestamptz("delete_requested_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("private_assets_storage_key_uidx").on(table.storageKey),
    index("private_assets_creator_created_at_idx").on(table.createdByUserAccountId, table.createdAt),
    index("private_assets_ingest_source_created_at_idx").on(table.ingestSource, table.createdAt),
    index("private_assets_sha256_idx").on(table.sha256),
    index("private_assets_status_created_at_idx").on(table.status, table.createdAt),
    check("private_assets_byte_size_range", sql`${table.byteSize} BETWEEN 1 AND 8388608`),
    check(
      "private_assets_dimensions_range",
      sql`${table.width} BETWEEN 16 AND 4096 AND ${table.height} BETWEEN 16 AND 4096 AND (${table.width}::bigint * ${table.height}::bigint) <= 16777216`,
    ),
    check("private_assets_sha256_32_bytes", sql`octet_length(${table.sha256}) = 32`),
    check(
      "private_assets_content_type_allowed",
      sql`${table.contentType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check("private_assets_purpose_nonempty", sql`char_length(${table.purpose}) BETWEEN 1 AND 64`),
    check(
      "private_assets_storage_provider_nonempty",
      sql`char_length(${table.storageProvider}) BETWEEN 1 AND 32`,
    ),
    check(
      "private_assets_ingest_actor_consistency",
      sql`(
        (${table.ingestSource} IN ('WEB_USER', 'ADMIN') AND ${table.createdByUserAccountId} IS NOT NULL)
        OR (${table.ingestSource} IN ('KAKAO_SERVICE', 'JOB') AND ${table.createdByUserAccountId} IS NULL)
      )`,
    ),
    check(
      "private_assets_lifecycle_consistency",
      sql`(
        (${table.status} = 'STAGED' AND ${table.readyAt} IS NULL AND ${table.deleteRequestedAt} IS NULL)
        OR (${table.status} = 'READY' AND ${table.readyAt} IS NOT NULL AND ${table.deleteRequestedAt} IS NULL)
        OR (${table.status} = 'DELETE_PENDING' AND ${table.deleteRequestedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const matchSubmissionImages = competitionSchema.table(
  "match_submission_images",
  {
    id: uuid("id").primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => matchSubmissions.id, { onDelete: "restrict" }),
    privateAssetId: uuid("private_asset_id")
      .notNull()
      .references(() => privateAssets.id, { onDelete: "restrict" }),
    gameNumber: integer("game_number").notNull(),
    ocrStatus: matchSubmissionImageOcrStatus("ocr_status").default("NOT_REQUESTED").notNull(),
    ocrCandidateJson: jsonb("ocr_candidate_json").$type<Record<string, unknown>>(),
    ocrErrorCode: varchar("ocr_error_code", { length: 64 }),
    revision: bigint("revision", { mode: "number" }).default(0).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_submission_images_submission_game_uidx").on(
      table.submissionId,
      table.gameNumber,
    ),
    uniqueIndex("match_submission_images_private_asset_uidx").on(table.privateAssetId),
    index("match_submission_images_ocr_status_idx").on(table.ocrStatus, table.updatedAt),
    check("match_submission_images_game_number_range", sql`${table.gameNumber} BETWEEN 1 AND 5`),
    check("match_submission_images_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "match_submission_images_ocr_candidate_size",
      sql`${table.ocrCandidateJson} IS NULL OR octet_length(${table.ocrCandidateJson}::text) <= 65536`,
    ),
    check(
      "match_submission_images_ocr_consistency",
      sql`(
        (${table.ocrStatus} IN ('NOT_REQUESTED', 'PENDING') AND ${table.ocrCandidateJson} IS NULL AND ${table.ocrErrorCode} IS NULL)
        OR (${table.ocrStatus} = 'SUCCEEDED' AND ${table.ocrCandidateJson} IS NOT NULL AND ${table.ocrErrorCode} IS NULL)
        OR (${table.ocrStatus} = 'FAILED' AND ${table.ocrCandidateJson} IS NULL AND ${table.ocrErrorCode} IS NOT NULL)
      )`,
    ),
  ],
);

export const matchCommandReceipts = competitionSchema.table(
  "match_command_receipts",
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
    responseEtag: varchar("response_etag", { length: 32 }),
    targetId: uuid("target_id"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("match_command_receipts_actor_scope_key_uidx").on(
      table.actorUserAccountId,
      table.scope,
      table.keyHash,
    ),
    index("match_command_receipts_expires_at_idx").on(table.expiresAt),
    check("match_command_receipts_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check(
      "match_command_receipts_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check(
      "match_command_receipts_status_success",
      sql`${table.responseStatus} BETWEEN 200 AND 299`,
    ),
    check(
      "match_command_receipts_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const matchAggregateVersions = competitionSchema.table(
  "match_aggregate_versions",
  {
    id: uuid("id").primaryKey(),
    matchSeriesId: uuid("match_series_id")
      .notNull()
      .references(() => matchSeries.id, { onDelete: "restrict" }),
    revision: bigint("revision", { mode: "number" }).notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull(),
    inputDigest: bytea("input_digest").notNull(),
    archivedByUserAccountId: uuid("archived_by_user_account_id").references(
      () => userAccounts.id,
      { onDelete: "set null" },
    ),
    archivedAt: timestamptz("archived_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_aggregate_versions_match_revision_uidx").on(
      table.matchSeriesId,
      table.revision,
    ),
    index("match_aggregate_versions_archived_at_idx").on(table.archivedAt),
    check("match_aggregate_versions_revision_nonnegative", sql`${table.revision} >= 0`),
    check("match_aggregate_versions_digest_32_bytes", sql`octet_length(${table.inputDigest}) = 32`),
    check(
      "match_aggregate_versions_snapshot_size",
      sql`octet_length(${table.snapshotJson}::text) <= 1048576`,
    ),
  ],
);

export const matchRateLimitBuckets = competitionSchema.table(
  "match_rate_limit_buckets",
  {
    scope: matchRateLimitScope("scope").notNull(),
    keyHash: bytea("key_hash").notNull(),
    windowStartedAt: timestamptz("window_started_at").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    blockedUntil: timestamptz("blocked_until"),
    expiresAt: timestamptz("expires_at").notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_rate_limit_buckets_scope_key_window_uidx").on(
      table.scope,
      table.keyHash,
      table.windowStartedAt,
    ),
    index("match_rate_limit_buckets_expires_at_idx").on(table.expiresAt),
    check("match_rate_limit_buckets_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check("match_rate_limit_buckets_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "match_rate_limit_buckets_expiry_after_window",
      sql`${table.expiresAt} > ${table.windowStartedAt}`,
    ),
  ],
);

/**
 * Short-lived work authorization for a private scoreboard upload. The row is
 * created before the request body is decoded or any storage/OCR adapter is
 * invoked. Finalization consumes it in the same transaction as the asset,
 * submission revision, receipt and audit rows.
 */
export const matchUploadReservations = competitionSchema.table(
  "match_upload_reservations",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => matchSubmissions.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    gameNumber: integer("game_number").notNull(),
    expectedRevision: bigint("expected_revision", { mode: "number" }).notNull(),
    declaredContentType: varchar("declared_content_type", { length: 64 }).notNull(),
    declaredByteSize: integer("declared_byte_size").notNull(),
    declaredSha256: bytea("declared_sha256").notNull(),
    storageProvider: varchar("storage_provider", { length: 32 }).notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    status: matchUploadReservationStatus("status").default("RESERVED").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    stagedAt: timestamptz("staged_at"),
    finalizedAt: timestamptz("finalized_at"),
    deleteRequestedAt: timestamptz("delete_requested_at"),
    deleteFailureCode: varchar("delete_failure_code", { length: 64 }),
    storageDeletedAt: timestamptz("storage_deleted_at"),
    cancelledAt: timestamptz("cancelled_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_upload_reservations_active_key_uidx")
      .on(table.actorUserAccountId, table.scope, table.keyHash)
      .where(sql`${table.status} IN ('RESERVED', 'STAGED')`),
    uniqueIndex("match_upload_reservations_active_slot_uidx")
      .on(table.submissionId, table.gameNumber)
      .where(sql`${table.status} IN ('RESERVED', 'STAGED')`),
    uniqueIndex("match_upload_reservations_storage_key_uidx").on(table.storageKey),
    index("match_upload_reservations_expiry_idx").on(table.status, table.expiresAt),
    index("match_upload_reservations_submission_idx").on(table.submissionId, table.createdAt),
    check("match_upload_reservations_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check(
      "match_upload_reservations_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check(
      "match_upload_reservations_declared_sha256_32_bytes",
      sql`octet_length(${table.declaredSha256}) = 32`,
    ),
    check(
      "match_upload_reservations_game_number_range",
      sql`${table.gameNumber} BETWEEN 1 AND 5`,
    ),
    check(
      "match_upload_reservations_revision_nonnegative",
      sql`${table.expectedRevision} >= 0`,
    ),
    check(
      "match_upload_reservations_byte_size_range",
      sql`${table.declaredByteSize} BETWEEN 12 AND 8388608`,
    ),
    check(
      "match_upload_reservations_content_type_allowed",
      sql`${table.declaredContentType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check(
      "match_upload_reservations_storage_provider_nonempty",
      sql`char_length(${table.storageProvider}) BETWEEN 1 AND 32`,
    ),
    check(
      "match_upload_reservations_storage_key_nonempty",
      sql`char_length(${table.storageKey}) BETWEEN 1 AND 255`,
    ),
    check(
      "match_upload_reservations_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "match_upload_reservations_lifecycle_consistency",
      sql`(
        (${table.status} = 'RESERVED' AND ${table.stagedAt} IS NULL AND ${table.finalizedAt} IS NULL AND ${table.deleteRequestedAt} IS NULL AND ${table.storageDeletedAt} IS NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'STAGED' AND ${table.stagedAt} IS NOT NULL AND ${table.finalizedAt} IS NULL AND ${table.deleteRequestedAt} IS NULL AND ${table.storageDeletedAt} IS NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'FINALIZED' AND ${table.stagedAt} IS NOT NULL AND ${table.finalizedAt} IS NOT NULL AND ${table.deleteRequestedAt} IS NULL AND ${table.storageDeletedAt} IS NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'DELETE_PENDING' AND ${table.deleteRequestedAt} IS NOT NULL AND ${table.storageDeletedAt} IS NULL AND ${table.cancelledAt} IS NULL)
        OR (${table.status} = 'CANCELLED' AND ${table.cancelledAt} IS NOT NULL AND ((${table.deleteRequestedAt} IS NULL AND ${table.stagedAt} IS NULL AND ${table.finalizedAt} IS NULL AND ${table.storageDeletedAt} IS NULL) OR (${table.deleteRequestedAt} IS NOT NULL AND ${table.storageDeletedAt} IS NOT NULL)))
      )`,
    ),
  ],
);

/**
 * Durable authorization and lease for one administrator OCR retry. No storage
 * read or OCR provider call may start before this row is committed.
 */
export const matchOcrReservations = competitionSchema.table(
  "match_ocr_reservations",
  {
    id: uuid("id").primaryKey(),
    actorUserAccountId: uuid("actor_user_account_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => matchSubmissions.id, { onDelete: "restrict" }),
    imageId: uuid("image_id")
      .notNull()
      .references(() => matchSubmissionImages.id, { onDelete: "restrict" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    keyHash: bytea("key_hash").notNull(),
    requestHash: bytea("request_hash").notNull(),
    expectedRevision: bigint("expected_revision", { mode: "number" }).notNull(),
    status: matchOcrReservationStatus("status").default("RESERVED").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    finalizedAt: timestamptz("finalized_at"),
    failedAt: timestamptz("failed_at"),
    failureCode: varchar("failure_code", { length: 64 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_ocr_reservations_active_actor_key_uidx")
      .on(table.actorUserAccountId, table.scope, table.keyHash)
      .where(sql`${table.status} = 'RESERVED'`),
    uniqueIndex("match_ocr_reservations_active_image_uidx")
      .on(table.imageId)
      .where(sql`${table.status} = 'RESERVED'`),
    index("match_ocr_reservations_expiry_idx").on(table.status, table.expiresAt),
    index("match_ocr_reservations_submission_idx").on(table.submissionId, table.createdAt),
    check("match_ocr_reservations_key_hash_32_bytes", sql`octet_length(${table.keyHash}) = 32`),
    check(
      "match_ocr_reservations_request_hash_32_bytes",
      sql`octet_length(${table.requestHash}) = 32`,
    ),
    check("match_ocr_reservations_revision_nonnegative", sql`${table.expectedRevision} >= 0`),
    check(
      "match_ocr_reservations_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "match_ocr_reservations_lifecycle_consistency",
      sql`(
        (${table.status} = 'RESERVED' AND ${table.finalizedAt} IS NULL AND ${table.failedAt} IS NULL AND ${table.failureCode} IS NULL)
        OR (${table.status} = 'FINALIZED' AND ${table.finalizedAt} IS NOT NULL AND ${table.failedAt} IS NULL AND ${table.failureCode} IS NULL)
        OR (${table.status} = 'FAILED' AND ${table.finalizedAt} IS NULL AND ${table.failedAt} IS NOT NULL AND char_length(${table.failureCode}) BETWEEN 1 AND 64)
      )`,
    ),
  ],
);

export const matchRecalculationOutbox = competitionSchema.table(
  "match_recalculation_outbox",
  {
    id: uuid("id").primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    matchRevision: bigint("match_revision", { mode: "number" }).notNull(),
    teamBalanceDraftId: uuid("team_balance_draft_id"),
    oldSeasonId: uuid("old_season_id").references(() => seasons.id, { onDelete: "restrict" }),
    newSeasonId: uuid("new_season_id").references(() => seasons.id, { onDelete: "restrict" }),
    oldOrderKey: varchar("old_order_key", { length: 255 }),
    newOrderKey: varchar("new_order_key", { length: 255 }),
    inputDigest: bytea("input_digest").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    status: matchOutboxStatus("status").default("PENDING").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamptz("available_at").defaultNow().notNull(),
    lockedAt: timestamptz("locked_at"),
    deliveredAt: timestamptz("delivered_at"),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("match_recalculation_outbox_dedupe_key_uidx").on(table.dedupeKey),
    index("match_recalculation_outbox_dispatch_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
    index("match_recalculation_outbox_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt,
    ),
    check("match_recalculation_outbox_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
    check("match_recalculation_outbox_revision_nonnegative", sql`${table.matchRevision} >= 0`),
    check("match_recalculation_outbox_input_digest_32_bytes", sql`octet_length(${table.inputDigest}) = 32`),
    check("match_recalculation_outbox_aggregate_match", sql`${table.aggregateType} = 'MATCH_SERIES'`),
    check(
      "match_recalculation_outbox_event_allowed",
      sql`${table.eventType} = 'MATCH_CHANGED'`,
    ),
    check(
      "match_recalculation_outbox_action_scope_consistency",
      sql`(
        (${table.action} = 'CREATED' AND ${table.oldSeasonId} IS NULL AND ${table.newSeasonId} IS NULL AND ${table.oldOrderKey} IS NULL AND ${table.newOrderKey} IS NULL)
        OR (${table.action} = 'AMENDED' AND ((${table.oldSeasonId} IS NULL AND ${table.newSeasonId} IS NULL AND ${table.oldOrderKey} IS NULL AND ${table.newOrderKey} IS NULL) OR (${table.oldSeasonId} IS NOT NULL AND ${table.newSeasonId} IS NOT NULL AND ${table.oldOrderKey} IS NOT NULL AND ${table.newOrderKey} IS NOT NULL)))
        OR (${table.action} IN ('PUBLISHED', 'RESTORED') AND ${table.oldSeasonId} IS NULL AND ${table.newSeasonId} IS NOT NULL AND ${table.oldOrderKey} IS NULL AND ${table.newOrderKey} IS NOT NULL)
        OR (${table.action} = 'VOIDED' AND ${table.oldSeasonId} IS NOT NULL AND ${table.newSeasonId} IS NULL AND ${table.oldOrderKey} IS NOT NULL AND ${table.newOrderKey} IS NULL)
      )`,
    ),
    check(
      "match_recalculation_outbox_lifecycle_consistency",
      sql`(
        (${table.status} = 'PENDING' AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NULL)
        OR (${table.status} = 'PROCESSING' AND ${table.lockedAt} IS NOT NULL AND ${table.deliveredAt} IS NULL)
        OR (${table.status} = 'DELIVERED' AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NOT NULL AND ${table.lastErrorCode} IS NULL)
        OR (${table.status} = 'FAILED' AND ${table.lockedAt} IS NULL AND ${table.deliveredAt} IS NULL AND ${table.lastErrorCode} IS NOT NULL)
      )`,
    ),
  ],
);
