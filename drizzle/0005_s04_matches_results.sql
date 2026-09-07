DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_available_extensions
     WHERE name = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = '0005 requires the pg_trgm extension, but this PostgreSQL installation does not provide it';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_extension
     WHERE extname = 'pg_trgm'
  ) AND NOT has_database_privilege(current_user, current_database(), 'CREATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = '0005 requires CREATE privilege on the current database to install pg_trgm';
  END IF;
END $$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
--> statement-breakpoint
CREATE SCHEMA "assets";
--> statement-breakpoint
CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE TYPE "competition"."match_ocr_reservation_status" AS ENUM('RESERVED', 'FINALIZED', 'FAILED');--> statement-breakpoint
CREATE TYPE "competition"."match_outbox_status" AS ENUM('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "competition"."match_position" AS ENUM('TOP', 'JGL', 'MID', 'ADC', 'SUP');--> statement-breakpoint
CREATE TYPE "competition"."match_rate_limit_scope" AS ENUM('SUBMISSION_CREATE', 'SUBMISSION_UPDATE', 'IMAGE_UPLOAD', 'ADMIN_MUTATION');--> statement-breakpoint
CREATE TYPE "competition"."match_series_status" AS ENUM('DRAFT', 'PUBLISHED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "competition"."match_submission_image_ocr_status" AS ENUM('NOT_REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "competition"."match_submission_source" AS ENUM('WEB', 'KAKAO', 'ADMIN');--> statement-breakpoint
CREATE TYPE "competition"."match_submission_status" AS ENUM('AWAITING_UPLOAD', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "competition"."match_team" AS ENUM('BLUE', 'RED');--> statement-breakpoint
CREATE TYPE "competition"."match_upload_reservation_status" AS ENUM('RESERVED', 'STAGED', 'FINALIZED', 'DELETE_PENDING', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "assets"."private_asset_ingest_source" AS ENUM('WEB_USER', 'ADMIN', 'KAKAO_SERVICE', 'JOB');--> statement-breakpoint
CREATE TYPE "assets"."private_asset_status" AS ENUM('STAGED', 'READY', 'DELETE_PENDING');--> statement-breakpoint
CREATE TYPE "catalog"."champion_catalog_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "competition"."match_aggregate_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_series_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"input_digest" "bytea" NOT NULL,
	"archived_by_user_account_id" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_aggregate_versions_revision_nonnegative" CHECK ("competition"."match_aggregate_versions"."revision" >= 0),
	CONSTRAINT "match_aggregate_versions_digest_32_bytes" CHECK (octet_length("competition"."match_aggregate_versions"."input_digest") = 32),
	CONSTRAINT "match_aggregate_versions_snapshot_size" CHECK (octet_length("competition"."match_aggregate_versions"."snapshot_json"::text) <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "competition"."match_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_command_receipts_key_hash_32_bytes" CHECK (octet_length("competition"."match_command_receipts"."key_hash") = 32),
	CONSTRAINT "match_command_receipts_request_hash_32_bytes" CHECK (octet_length("competition"."match_command_receipts"."request_hash") = 32),
	CONSTRAINT "match_command_receipts_status_success" CHECK ("competition"."match_command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "match_command_receipts_expiry_after_creation" CHECK ("competition"."match_command_receipts"."expires_at" > "competition"."match_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "competition"."match_games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"winner_team" "competition"."match_team" NOT NULL,
	"mvp_player_id" uuid NOT NULL,
	"mvp_score_units_2" integer NOT NULL,
	"mvp_formula_version" varchar(32) NOT NULL,
	"mvp_selection" varchar(64) NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_games_game_number_range" CHECK ("competition"."match_games"."game_number" BETWEEN 1 AND 9),
	CONSTRAINT "match_games_duration_range" CHECK ("competition"."match_games"."duration_seconds" BETWEEN 60 AND 7200),
	CONSTRAINT "match_games_mvp_score_range" CHECK ("competition"."match_games"."mvp_score_units_2" BETWEEN -4000 AND 10000),
	CONSTRAINT "match_games_mvp_formula_v1" CHECK ("competition"."match_games"."mvp_formula_version" = 'V1_COMPAT_1'),
	CONSTRAINT "match_games_mvp_selection_v1" CHECK ("competition"."match_games"."mvp_selection" = 'WINNER_SCORE_KDA_PLAYER_ID_V1'),
	CONSTRAINT "match_games_revision_nonnegative" CHECK ("competition"."match_games"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "competition"."match_ocr_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"expected_revision" bigint NOT NULL,
	"status" "competition"."match_ocr_reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_ocr_reservations_key_hash_32_bytes" CHECK (octet_length("competition"."match_ocr_reservations"."key_hash") = 32),
	CONSTRAINT "match_ocr_reservations_request_hash_32_bytes" CHECK (octet_length("competition"."match_ocr_reservations"."request_hash") = 32),
	CONSTRAINT "match_ocr_reservations_revision_nonnegative" CHECK ("competition"."match_ocr_reservations"."expected_revision" >= 0),
	CONSTRAINT "match_ocr_reservations_expiry_after_creation" CHECK ("competition"."match_ocr_reservations"."expires_at" > "competition"."match_ocr_reservations"."created_at"),
	CONSTRAINT "match_ocr_reservations_lifecycle_consistency" CHECK ((
        ("competition"."match_ocr_reservations"."status" = 'RESERVED' AND "competition"."match_ocr_reservations"."finalized_at" IS NULL AND "competition"."match_ocr_reservations"."failed_at" IS NULL AND "competition"."match_ocr_reservations"."failure_code" IS NULL)
        OR ("competition"."match_ocr_reservations"."status" = 'FINALIZED' AND "competition"."match_ocr_reservations"."finalized_at" IS NOT NULL AND "competition"."match_ocr_reservations"."failed_at" IS NULL AND "competition"."match_ocr_reservations"."failure_code" IS NULL)
        OR ("competition"."match_ocr_reservations"."status" = 'FAILED' AND "competition"."match_ocr_reservations"."finalized_at" IS NULL AND "competition"."match_ocr_reservations"."failed_at" IS NOT NULL AND char_length("competition"."match_ocr_reservations"."failure_code") BETWEEN 1 AND 64)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."match_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"nickname_snapshot" varchar(64) NOT NULL,
	"tag_line_snapshot" varchar(32) NOT NULL,
	"champion_key" varchar(64) NOT NULL,
	"team" "competition"."match_team" NOT NULL,
	"position" "competition"."match_position" NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"mvp_score_units_2" integer NOT NULL,
	"mvp_formula_version" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participants_nickname_snapshot_nonempty" CHECK (char_length("competition"."match_participants"."nickname_snapshot") > 0),
	CONSTRAINT "match_participants_tag_line_snapshot_nonempty" CHECK (char_length("competition"."match_participants"."tag_line_snapshot") > 0),
	CONSTRAINT "match_participants_champion_nonempty" CHECK (char_length("competition"."match_participants"."champion_key") > 0),
	CONSTRAINT "match_participants_kda_range" CHECK ("competition"."match_participants"."kills" BETWEEN 0 AND 999 AND "competition"."match_participants"."deaths" BETWEEN 0 AND 999 AND "competition"."match_participants"."assists" BETWEEN 0 AND 999),
	CONSTRAINT "match_participants_mvp_formula_v1" CHECK ("competition"."match_participants"."mvp_formula_version" = 'V1_COMPAT_1'),
	CONSTRAINT "match_participants_mvp_score_range" CHECK ("competition"."match_participants"."mvp_score_units_2" BETWEEN -4000 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "competition"."match_rate_limit_buckets" (
	"scope" "competition"."match_rate_limit_scope" NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_rate_limit_buckets_key_hash_32_bytes" CHECK (octet_length("competition"."match_rate_limit_buckets"."key_hash") = 32),
	CONSTRAINT "match_rate_limit_buckets_attempt_count_nonnegative" CHECK ("competition"."match_rate_limit_buckets"."attempt_count" >= 0),
	CONSTRAINT "match_rate_limit_buckets_expiry_after_window" CHECK ("competition"."match_rate_limit_buckets"."expires_at" > "competition"."match_rate_limit_buckets"."window_started_at")
);
--> statement-breakpoint
CREATE TABLE "competition"."match_recalculation_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"action" varchar(32) NOT NULL,
	"dedupe_key" varchar(160) NOT NULL,
	"match_revision" bigint NOT NULL,
	"team_balance_draft_id" uuid,
	"old_season_id" uuid,
	"new_season_id" uuid,
	"old_order_key" varchar(255),
	"new_order_key" varchar(255),
	"input_digest" "bytea" NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "competition"."match_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_recalculation_outbox_attempt_nonnegative" CHECK ("competition"."match_recalculation_outbox"."attempt_count" >= 0),
	CONSTRAINT "match_recalculation_outbox_revision_nonnegative" CHECK ("competition"."match_recalculation_outbox"."match_revision" >= 0),
	CONSTRAINT "match_recalculation_outbox_input_digest_32_bytes" CHECK (octet_length("competition"."match_recalculation_outbox"."input_digest") = 32),
	CONSTRAINT "match_recalculation_outbox_aggregate_match" CHECK ("competition"."match_recalculation_outbox"."aggregate_type" = 'MATCH_SERIES'),
	CONSTRAINT "match_recalculation_outbox_event_allowed" CHECK ("competition"."match_recalculation_outbox"."event_type" = 'MATCH_CHANGED'),
	CONSTRAINT "match_recalculation_outbox_action_scope_consistency" CHECK ((
        ("competition"."match_recalculation_outbox"."action" = 'CREATED' AND "competition"."match_recalculation_outbox"."old_season_id" IS NULL AND "competition"."match_recalculation_outbox"."new_season_id" IS NULL AND "competition"."match_recalculation_outbox"."old_order_key" IS NULL AND "competition"."match_recalculation_outbox"."new_order_key" IS NULL)
        OR ("competition"."match_recalculation_outbox"."action" = 'AMENDED' AND (("competition"."match_recalculation_outbox"."old_season_id" IS NULL AND "competition"."match_recalculation_outbox"."new_season_id" IS NULL AND "competition"."match_recalculation_outbox"."old_order_key" IS NULL AND "competition"."match_recalculation_outbox"."new_order_key" IS NULL) OR ("competition"."match_recalculation_outbox"."old_season_id" IS NOT NULL AND "competition"."match_recalculation_outbox"."new_season_id" IS NOT NULL AND "competition"."match_recalculation_outbox"."old_order_key" IS NOT NULL AND "competition"."match_recalculation_outbox"."new_order_key" IS NOT NULL)))
        OR ("competition"."match_recalculation_outbox"."action" IN ('PUBLISHED', 'RESTORED') AND "competition"."match_recalculation_outbox"."old_season_id" IS NULL AND "competition"."match_recalculation_outbox"."new_season_id" IS NOT NULL AND "competition"."match_recalculation_outbox"."old_order_key" IS NULL AND "competition"."match_recalculation_outbox"."new_order_key" IS NOT NULL)
        OR ("competition"."match_recalculation_outbox"."action" = 'VOIDED' AND "competition"."match_recalculation_outbox"."old_season_id" IS NOT NULL AND "competition"."match_recalculation_outbox"."new_season_id" IS NULL AND "competition"."match_recalculation_outbox"."old_order_key" IS NOT NULL AND "competition"."match_recalculation_outbox"."new_order_key" IS NULL)
      )),
	CONSTRAINT "match_recalculation_outbox_lifecycle_consistency" CHECK ((
        ("competition"."match_recalculation_outbox"."status" = 'PENDING' AND "competition"."match_recalculation_outbox"."locked_at" IS NULL AND "competition"."match_recalculation_outbox"."delivered_at" IS NULL)
        OR ("competition"."match_recalculation_outbox"."status" = 'PROCESSING' AND "competition"."match_recalculation_outbox"."locked_at" IS NOT NULL AND "competition"."match_recalculation_outbox"."delivered_at" IS NULL)
        OR ("competition"."match_recalculation_outbox"."status" = 'DELIVERED' AND "competition"."match_recalculation_outbox"."locked_at" IS NULL AND "competition"."match_recalculation_outbox"."delivered_at" IS NOT NULL AND "competition"."match_recalculation_outbox"."last_error_code" IS NULL)
        OR ("competition"."match_recalculation_outbox"."status" = 'FAILED' AND "competition"."match_recalculation_outbox"."locked_at" IS NULL AND "competition"."match_recalculation_outbox"."delivered_at" IS NULL AND "competition"."match_recalculation_outbox"."last_error_code" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."match_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" bigint,
	"season_id" uuid NOT NULL,
	"team_balance_draft_id" uuid,
	"title" varchar(160) NOT NULL,
	"title_normalized" varchar(160) NOT NULL,
	"played_on" date NOT NULL,
	"started_at" timestamp with time zone,
	"started_at_offset_minutes" integer,
	"blue_wins" integer NOT NULL,
	"red_wins" integer NOT NULL,
	"game_count" integer NOT NULL,
	"status" "competition"."match_series_status" DEFAULT 'DRAFT' NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_by_user_account_id" uuid,
	"updated_by_user_account_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_series_legacy_id_int32" CHECK ("competition"."match_series"."legacy_id" IS NULL OR "competition"."match_series"."legacy_id" BETWEEN 1 AND 2147483647),
	CONSTRAINT "match_series_title_normalized_nonempty" CHECK (char_length("competition"."match_series"."title_normalized") > 0),
	CONSTRAINT "match_series_revision_nonnegative" CHECK ("competition"."match_series"."revision" >= 0),
	CONSTRAINT "match_series_result_summary" CHECK ("competition"."match_series"."game_count" BETWEEN 1 AND 9 AND "competition"."match_series"."blue_wins" >= 0 AND "competition"."match_series"."red_wins" >= 0 AND "competition"."match_series"."blue_wins" + "competition"."match_series"."red_wins" = "competition"."match_series"."game_count"),
	CONSTRAINT "match_series_started_at_offset_consistency" CHECK (("competition"."match_series"."started_at" IS NULL AND "competition"."match_series"."started_at_offset_minutes" IS NULL) OR ("competition"."match_series"."started_at" IS NOT NULL AND "competition"."match_series"."started_at_offset_minutes" BETWEEN -840 AND 840)),
	CONSTRAINT "match_series_lifecycle_consistency" CHECK ((
        ("competition"."match_series"."status" = 'DRAFT' AND "competition"."match_series"."published_at" IS NULL AND "competition"."match_series"."voided_at" IS NULL AND "competition"."match_series"."void_reason" IS NULL)
        OR ("competition"."match_series"."status" = 'PUBLISHED' AND "competition"."match_series"."published_at" IS NOT NULL AND "competition"."match_series"."voided_at" IS NULL AND "competition"."match_series"."void_reason" IS NULL)
        OR ("competition"."match_series"."status" = 'VOIDED' AND "competition"."match_series"."published_at" IS NOT NULL AND "competition"."match_series"."voided_at" IS NOT NULL AND char_length("competition"."match_series"."void_reason") BETWEEN 3 AND 1000)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."match_submission_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"private_asset_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"ocr_status" "competition"."match_submission_image_ocr_status" DEFAULT 'NOT_REQUESTED' NOT NULL,
	"ocr_candidate_json" jsonb,
	"ocr_error_code" varchar(64),
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_submission_images_game_number_range" CHECK ("competition"."match_submission_images"."game_number" BETWEEN 1 AND 5),
	CONSTRAINT "match_submission_images_revision_nonnegative" CHECK ("competition"."match_submission_images"."revision" >= 0),
	CONSTRAINT "match_submission_images_ocr_candidate_size" CHECK ("competition"."match_submission_images"."ocr_candidate_json" IS NULL OR octet_length("competition"."match_submission_images"."ocr_candidate_json"::text) <= 65536),
	CONSTRAINT "match_submission_images_ocr_consistency" CHECK ((
        ("competition"."match_submission_images"."ocr_status" IN ('NOT_REQUESTED', 'PENDING') AND "competition"."match_submission_images"."ocr_candidate_json" IS NULL AND "competition"."match_submission_images"."ocr_error_code" IS NULL)
        OR ("competition"."match_submission_images"."ocr_status" = 'SUCCEEDED' AND "competition"."match_submission_images"."ocr_candidate_json" IS NOT NULL AND "competition"."match_submission_images"."ocr_error_code" IS NULL)
        OR ("competition"."match_submission_images"."ocr_status" = 'FAILED' AND "competition"."match_submission_images"."ocr_candidate_json" IS NULL AND "competition"."match_submission_images"."ocr_error_code" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."match_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" bigint,
	"public_code" varchar(24) NOT NULL,
	"owner_user_account_id" uuid,
	"season_id" uuid,
	"title" varchar(160) NOT NULL,
	"organizer" varchar(100) NOT NULL,
	"series_number" integer NOT NULL,
	"note" text,
	"played_on" date NOT NULL,
	"started_at" timestamp with time zone,
	"started_at_offset_minutes" integer,
	"expected_game_count" integer NOT NULL,
	"team_balance_draft_id" uuid,
	"source" "competition"."match_submission_source" DEFAULT 'WEB' NOT NULL,
	"source_reference_hash" "bytea" NOT NULL,
	"provenance_json" jsonb,
	"reviewed_result_json" jsonb,
	"status" "competition"."match_submission_status" DEFAULT 'AWAITING_UPLOAD' NOT NULL,
	"public_review_reason" text,
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"approved_match_series_id" uuid,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_submissions_legacy_id_positive" CHECK ("competition"."match_submissions"."legacy_id" IS NULL OR "competition"."match_submissions"."legacy_id" BETWEEN 1 AND 2147483647),
	CONSTRAINT "match_submissions_public_code_nonempty" CHECK (char_length("competition"."match_submissions"."public_code") >= 12),
	CONSTRAINT "match_submissions_series_number_positive" CHECK ("competition"."match_submissions"."series_number" > 0),
	CONSTRAINT "match_submissions_game_count_source_contract" CHECK (("competition"."match_submissions"."source" IN ('WEB', 'KAKAO') AND "competition"."match_submissions"."expected_game_count" IN (2, 3)) OR ("competition"."match_submissions"."source" = 'ADMIN' AND "competition"."match_submissions"."expected_game_count" = 1)),
	CONSTRAINT "match_submissions_source_reference_32_bytes" CHECK (octet_length("competition"."match_submissions"."source_reference_hash") = 32),
	CONSTRAINT "match_submissions_source_owner_consistency" CHECK (("competition"."match_submissions"."source" = 'WEB' AND "competition"."match_submissions"."owner_user_account_id" IS NOT NULL) OR ("competition"."match_submissions"."source" IN ('KAKAO', 'ADMIN') AND "competition"."match_submissions"."owner_user_account_id" IS NULL)),
	CONSTRAINT "match_submissions_note_size" CHECK ("competition"."match_submissions"."note" IS NULL OR char_length("competition"."match_submissions"."note") <= 1000),
	CONSTRAINT "match_submissions_provenance_size" CHECK ("competition"."match_submissions"."provenance_json" IS NULL OR octet_length("competition"."match_submissions"."provenance_json"::text) <= 16384),
	CONSTRAINT "match_submissions_revision_nonnegative" CHECK ("competition"."match_submissions"."revision" >= 0),
	CONSTRAINT "match_submissions_reviewed_result_size" CHECK ("competition"."match_submissions"."reviewed_result_json" IS NULL OR octet_length("competition"."match_submissions"."reviewed_result_json"::text) <= 262144),
	CONSTRAINT "match_submissions_started_at_offset_consistency" CHECK (("competition"."match_submissions"."started_at" IS NULL AND "competition"."match_submissions"."started_at_offset_minutes" IS NULL) OR ("competition"."match_submissions"."started_at" IS NOT NULL AND "competition"."match_submissions"."started_at_offset_minutes" BETWEEN -840 AND 840)),
	CONSTRAINT "match_submissions_review_consistency" CHECK ((
        ("competition"."match_submissions"."status" IN ('AWAITING_UPLOAD', 'PENDING_REVIEW') AND "competition"."match_submissions"."public_review_reason" IS NULL AND "competition"."match_submissions"."reviewed_by_user_account_id" IS NULL AND "competition"."match_submissions"."reviewed_at" IS NULL AND "competition"."match_submissions"."cancelled_at" IS NULL AND "competition"."match_submissions"."approved_match_series_id" IS NULL)
        OR ("competition"."match_submissions"."status" = 'REJECTED' AND char_length("competition"."match_submissions"."public_review_reason") BETWEEN 3 AND 1000 AND "competition"."match_submissions"."reviewed_by_user_account_id" IS NOT NULL AND "competition"."match_submissions"."reviewed_at" IS NOT NULL AND "competition"."match_submissions"."cancelled_at" IS NULL AND "competition"."match_submissions"."approved_match_series_id" IS NULL)
        OR ("competition"."match_submissions"."status" = 'APPROVED' AND "competition"."match_submissions"."reviewed_by_user_account_id" IS NOT NULL AND "competition"."match_submissions"."reviewed_at" IS NOT NULL AND "competition"."match_submissions"."cancelled_at" IS NULL AND "competition"."match_submissions"."approved_match_series_id" IS NOT NULL)
        OR ("competition"."match_submissions"."status" = 'CANCELLED' AND "competition"."match_submissions"."public_review_reason" IS NULL AND "competition"."match_submissions"."reviewed_by_user_account_id" IS NULL AND "competition"."match_submissions"."reviewed_at" IS NULL AND "competition"."match_submissions"."cancelled_at" IS NOT NULL AND "competition"."match_submissions"."approved_match_series_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."match_upload_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"game_number" integer NOT NULL,
	"expected_revision" bigint NOT NULL,
	"declared_content_type" varchar(64) NOT NULL,
	"declared_byte_size" integer NOT NULL,
	"declared_sha256" "bytea" NOT NULL,
	"storage_provider" varchar(32) NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"status" "competition"."match_upload_reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"staged_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"delete_requested_at" timestamp with time zone,
	"delete_failure_code" varchar(64),
	"storage_deleted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_upload_reservations_key_hash_32_bytes" CHECK (octet_length("competition"."match_upload_reservations"."key_hash") = 32),
	CONSTRAINT "match_upload_reservations_request_hash_32_bytes" CHECK (octet_length("competition"."match_upload_reservations"."request_hash") = 32),
	CONSTRAINT "match_upload_reservations_declared_sha256_32_bytes" CHECK (octet_length("competition"."match_upload_reservations"."declared_sha256") = 32),
	CONSTRAINT "match_upload_reservations_game_number_range" CHECK ("competition"."match_upload_reservations"."game_number" BETWEEN 1 AND 5),
	CONSTRAINT "match_upload_reservations_revision_nonnegative" CHECK ("competition"."match_upload_reservations"."expected_revision" >= 0),
	CONSTRAINT "match_upload_reservations_byte_size_range" CHECK ("competition"."match_upload_reservations"."declared_byte_size" BETWEEN 12 AND 8388608),
	CONSTRAINT "match_upload_reservations_content_type_allowed" CHECK ("competition"."match_upload_reservations"."declared_content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "match_upload_reservations_storage_provider_nonempty" CHECK (char_length("competition"."match_upload_reservations"."storage_provider") BETWEEN 1 AND 32),
	CONSTRAINT "match_upload_reservations_storage_key_nonempty" CHECK (char_length("competition"."match_upload_reservations"."storage_key") BETWEEN 1 AND 255),
	CONSTRAINT "match_upload_reservations_expiry_after_creation" CHECK ("competition"."match_upload_reservations"."expires_at" > "competition"."match_upload_reservations"."created_at"),
	CONSTRAINT "match_upload_reservations_lifecycle_consistency" CHECK ((
        ("competition"."match_upload_reservations"."status" = 'RESERVED' AND "competition"."match_upload_reservations"."staged_at" IS NULL AND "competition"."match_upload_reservations"."finalized_at" IS NULL AND "competition"."match_upload_reservations"."delete_requested_at" IS NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NULL AND "competition"."match_upload_reservations"."cancelled_at" IS NULL)
        OR ("competition"."match_upload_reservations"."status" = 'STAGED' AND "competition"."match_upload_reservations"."staged_at" IS NOT NULL AND "competition"."match_upload_reservations"."finalized_at" IS NULL AND "competition"."match_upload_reservations"."delete_requested_at" IS NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NULL AND "competition"."match_upload_reservations"."cancelled_at" IS NULL)
        OR ("competition"."match_upload_reservations"."status" = 'FINALIZED' AND "competition"."match_upload_reservations"."staged_at" IS NOT NULL AND "competition"."match_upload_reservations"."finalized_at" IS NOT NULL AND "competition"."match_upload_reservations"."delete_requested_at" IS NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NULL AND "competition"."match_upload_reservations"."cancelled_at" IS NULL)
        OR ("competition"."match_upload_reservations"."status" = 'DELETE_PENDING' AND "competition"."match_upload_reservations"."delete_requested_at" IS NOT NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NULL AND "competition"."match_upload_reservations"."cancelled_at" IS NULL)
        OR ("competition"."match_upload_reservations"."status" = 'CANCELLED' AND "competition"."match_upload_reservations"."cancelled_at" IS NOT NULL AND (("competition"."match_upload_reservations"."delete_requested_at" IS NULL AND "competition"."match_upload_reservations"."staged_at" IS NULL AND "competition"."match_upload_reservations"."finalized_at" IS NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NULL) OR ("competition"."match_upload_reservations"."delete_requested_at" IS NOT NULL AND "competition"."match_upload_reservations"."storage_deleted_at" IS NOT NULL)))
      ))
);
--> statement-breakpoint
CREATE TABLE "assets"."private_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by_user_account_id" uuid,
	"ingest_source" "assets"."private_asset_ingest_source" NOT NULL,
	"storage_provider" varchar(32) NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"original_file_name" varchar(255),
	"content_type" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" "bytea" NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"status" "assets"."private_asset_status" DEFAULT 'STAGED' NOT NULL,
	"ready_at" timestamp with time zone,
	"delete_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_assets_byte_size_range" CHECK ("assets"."private_assets"."byte_size" BETWEEN 1 AND 8388608),
	CONSTRAINT "private_assets_dimensions_range" CHECK ("assets"."private_assets"."width" BETWEEN 16 AND 4096 AND "assets"."private_assets"."height" BETWEEN 16 AND 4096 AND ("assets"."private_assets"."width"::bigint * "assets"."private_assets"."height"::bigint) <= 16777216),
	CONSTRAINT "private_assets_sha256_32_bytes" CHECK (octet_length("assets"."private_assets"."sha256") = 32),
	CONSTRAINT "private_assets_content_type_allowed" CHECK ("assets"."private_assets"."content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "private_assets_purpose_nonempty" CHECK (char_length("assets"."private_assets"."purpose") BETWEEN 1 AND 64),
	CONSTRAINT "private_assets_storage_provider_nonempty" CHECK (char_length("assets"."private_assets"."storage_provider") BETWEEN 1 AND 32),
	CONSTRAINT "private_assets_ingest_actor_consistency" CHECK ((
        ("assets"."private_assets"."ingest_source" IN ('WEB_USER', 'ADMIN') AND "assets"."private_assets"."created_by_user_account_id" IS NOT NULL)
        OR ("assets"."private_assets"."ingest_source" IN ('KAKAO_SERVICE', 'JOB') AND "assets"."private_assets"."created_by_user_account_id" IS NULL)
      )),
	CONSTRAINT "private_assets_lifecycle_consistency" CHECK ((
        ("assets"."private_assets"."status" = 'STAGED' AND "assets"."private_assets"."ready_at" IS NULL AND "assets"."private_assets"."delete_requested_at" IS NULL)
        OR ("assets"."private_assets"."status" = 'READY' AND "assets"."private_assets"."ready_at" IS NOT NULL AND "assets"."private_assets"."delete_requested_at" IS NULL)
        OR ("assets"."private_assets"."status" = 'DELETE_PENDING' AND "assets"."private_assets"."delete_requested_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "catalog"."champions" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"status" "catalog"."champion_catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_catalog_key_canonical" CHECK ("catalog"."champions"."key" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
	CONSTRAINT "champion_catalog_display_name_nonempty" CHECK (char_length("catalog"."champions"."display_name") > 0),
	CONSTRAINT "champion_catalog_revision_nonnegative" CHECK ("catalog"."champions"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "competition"."match_aggregate_versions" ADD CONSTRAINT "match_aggregate_versions_match_series_id_match_series_id_fk" FOREIGN KEY ("match_series_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_aggregate_versions" ADD CONSTRAINT "match_aggregate_versions_archived_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("archived_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_command_receipts" ADD CONSTRAINT "match_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_games" ADD CONSTRAINT "match_games_series_id_match_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_games" ADD CONSTRAINT "match_games_mvp_player_id_players_id_fk" FOREIGN KEY ("mvp_player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_ocr_reservations" ADD CONSTRAINT "match_ocr_reservations_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_ocr_reservations" ADD CONSTRAINT "match_ocr_reservations_submission_id_match_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "competition"."match_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_ocr_reservations" ADD CONSTRAINT "match_ocr_reservations_image_id_match_submission_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "competition"."match_submission_images"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_participants" ADD CONSTRAINT "match_participants_game_id_match_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "competition"."match_games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_participants" ADD CONSTRAINT "match_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_participants" ADD CONSTRAINT "match_participants_champion_key_champions_key_fk" FOREIGN KEY ("champion_key") REFERENCES "catalog"."champions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_recalculation_outbox" ADD CONSTRAINT "match_recalculation_outbox_old_season_id_seasons_id_fk" FOREIGN KEY ("old_season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_recalculation_outbox" ADD CONSTRAINT "match_recalculation_outbox_new_season_id_seasons_id_fk" FOREIGN KEY ("new_season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_series" ADD CONSTRAINT "match_series_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_series" ADD CONSTRAINT "match_series_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_series" ADD CONSTRAINT "match_series_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submission_images" ADD CONSTRAINT "match_submission_images_submission_id_match_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "competition"."match_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submission_images" ADD CONSTRAINT "match_submission_images_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submissions" ADD CONSTRAINT "match_submissions_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submissions" ADD CONSTRAINT "match_submissions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submissions" ADD CONSTRAINT "match_submissions_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_submissions" ADD CONSTRAINT "match_submissions_approved_match_series_id_match_series_id_fk" FOREIGN KEY ("approved_match_series_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_upload_reservations" ADD CONSTRAINT "match_upload_reservations_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."match_upload_reservations" ADD CONSTRAINT "match_upload_reservations_submission_id_match_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "competition"."match_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets"."private_assets" ADD CONSTRAINT "private_assets_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_aggregate_versions_match_revision_uidx" ON "competition"."match_aggregate_versions" USING btree ("match_series_id","revision");--> statement-breakpoint
CREATE INDEX "match_aggregate_versions_archived_at_idx" ON "competition"."match_aggregate_versions" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_command_receipts_actor_scope_key_uidx" ON "competition"."match_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "match_command_receipts_expires_at_idx" ON "competition"."match_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_games_series_game_number_uidx" ON "competition"."match_games" USING btree ("series_id","game_number");--> statement-breakpoint
CREATE INDEX "match_games_series_idx" ON "competition"."match_games" USING btree ("series_id","game_number");--> statement-breakpoint
CREATE UNIQUE INDEX "match_ocr_reservations_active_actor_key_uidx" ON "competition"."match_ocr_reservations" USING btree ("actor_user_account_id","scope","key_hash") WHERE "competition"."match_ocr_reservations"."status" = 'RESERVED';--> statement-breakpoint
CREATE UNIQUE INDEX "match_ocr_reservations_active_image_uidx" ON "competition"."match_ocr_reservations" USING btree ("image_id") WHERE "competition"."match_ocr_reservations"."status" = 'RESERVED';--> statement-breakpoint
CREATE INDEX "match_ocr_reservations_expiry_idx" ON "competition"."match_ocr_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "match_ocr_reservations_submission_idx" ON "competition"."match_ocr_reservations" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_game_player_uidx" ON "competition"."match_participants" USING btree ("game_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_game_champion_uidx" ON "competition"."match_participants" USING btree ("game_id","champion_key");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_game_team_position_uidx" ON "competition"."match_participants" USING btree ("game_id","team","position");--> statement-breakpoint
CREATE INDEX "match_participants_player_game_idx" ON "competition"."match_participants" USING btree ("player_id","game_id");--> statement-breakpoint
CREATE INDEX "match_participants_champion_idx" ON "competition"."match_participants" USING btree ("champion_key","game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_rate_limit_buckets_scope_key_window_uidx" ON "competition"."match_rate_limit_buckets" USING btree ("scope","key_hash","window_started_at");--> statement-breakpoint
CREATE INDEX "match_rate_limit_buckets_expires_at_idx" ON "competition"."match_rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_recalculation_outbox_dedupe_key_uidx" ON "competition"."match_recalculation_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "match_recalculation_outbox_dispatch_idx" ON "competition"."match_recalculation_outbox" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "match_recalculation_outbox_aggregate_idx" ON "competition"."match_recalculation_outbox" USING btree ("aggregate_type","aggregate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_series_legacy_id_uidx" ON "competition"."match_series" USING btree ("legacy_id");--> statement-breakpoint
CREATE INDEX "match_series_public_list_idx" ON "competition"."match_series" USING btree ("status","played_on","started_at","id");--> statement-breakpoint
CREATE INDEX "match_series_public_title_idx" ON "competition"."match_series" USING btree ("status","title_normalized","id");--> statement-breakpoint
CREATE INDEX "match_series_public_winner_idx" ON "competition"."match_series" USING btree ("status","blue_wins","red_wins","played_on","id");--> statement-breakpoint
CREATE INDEX "match_series_title_trgm_idx" ON "competition"."match_series" USING gin ("title_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "match_series_season_played_on_idx" ON "competition"."match_series" USING btree ("season_id","played_on","id");--> statement-breakpoint
CREATE INDEX "match_series_team_balance_draft_idx" ON "competition"."match_series" USING btree ("team_balance_draft_id");--> statement-breakpoint
CREATE INDEX "match_series_title_normalized_idx" ON "competition"."match_series" USING btree ("title_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submission_images_submission_game_uidx" ON "competition"."match_submission_images" USING btree ("submission_id","game_number");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submission_images_private_asset_uidx" ON "competition"."match_submission_images" USING btree ("private_asset_id");--> statement-breakpoint
CREATE INDEX "match_submission_images_ocr_status_idx" ON "competition"."match_submission_images" USING btree ("ocr_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_legacy_id_uidx" ON "competition"."match_submissions" USING btree ("legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_public_code_uidx" ON "competition"."match_submissions" USING btree ("public_code");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_approved_match_uidx" ON "competition"."match_submissions" USING btree ("approved_match_series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_web_owner_source_reference_uidx" ON "competition"."match_submissions" USING btree ("owner_user_account_id","source_reference_hash") WHERE "competition"."match_submissions"."source" = 'WEB';--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_kakao_source_reference_uidx" ON "competition"."match_submissions" USING btree ("source_reference_hash") WHERE "competition"."match_submissions"."source" = 'KAKAO';--> statement-breakpoint
CREATE UNIQUE INDEX "match_submissions_admin_source_reference_uidx" ON "competition"."match_submissions" USING btree ("source_reference_hash") WHERE "competition"."match_submissions"."source" = 'ADMIN';--> statement-breakpoint
CREATE INDEX "match_submissions_owner_status_idx" ON "competition"."match_submissions" USING btree ("owner_user_account_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "match_submissions_review_queue_idx" ON "competition"."match_submissions" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "match_submissions_season_played_on_idx" ON "competition"."match_submissions" USING btree ("season_id","played_on");--> statement-breakpoint
CREATE INDEX "match_submissions_title_trgm_idx" ON "competition"."match_submissions" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "match_submissions_organizer_trgm_idx" ON "competition"."match_submissions" USING gin ("organizer" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "match_submissions_public_code_trgm_idx" ON "competition"."match_submissions" USING gin ("public_code" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "match_upload_reservations_active_key_uidx" ON "competition"."match_upload_reservations" USING btree ("actor_user_account_id","scope","key_hash") WHERE "competition"."match_upload_reservations"."status" IN ('RESERVED', 'STAGED');--> statement-breakpoint
CREATE UNIQUE INDEX "match_upload_reservations_active_slot_uidx" ON "competition"."match_upload_reservations" USING btree ("submission_id","game_number") WHERE "competition"."match_upload_reservations"."status" IN ('RESERVED', 'STAGED');--> statement-breakpoint
CREATE UNIQUE INDEX "match_upload_reservations_storage_key_uidx" ON "competition"."match_upload_reservations" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "match_upload_reservations_expiry_idx" ON "competition"."match_upload_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "match_upload_reservations_submission_idx" ON "competition"."match_upload_reservations" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "private_assets_storage_key_uidx" ON "assets"."private_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "private_assets_creator_created_at_idx" ON "assets"."private_assets" USING btree ("created_by_user_account_id","created_at");--> statement-breakpoint
CREATE INDEX "private_assets_ingest_source_created_at_idx" ON "assets"."private_assets" USING btree ("ingest_source","created_at");--> statement-breakpoint
CREATE INDEX "private_assets_sha256_idx" ON "assets"."private_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "private_assets_status_created_at_idx" ON "assets"."private_assets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "champion_catalog_status_key_idx" ON "catalog"."champions" USING btree ("status","key");--> statement-breakpoint
CREATE INDEX "players_tag_line_normalized_idx" ON "registry"."players" USING btree ("tag_line_normalized");
