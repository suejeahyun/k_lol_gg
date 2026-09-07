CREATE SCHEMA "mmr";
--> statement-breakpoint
CREATE TYPE "mmr"."outbox_status" AS ENUM('PENDING', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "mmr"."projection_status" AS ENUM('EMPTY', 'READY');--> statement-breakpoint
CREATE TYPE "mmr"."projection_trigger" AS ENUM('BOOTSTRAP', 'CATCH_UP', 'ADMIN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "mmr"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mmr_command_receipts_key_hash" CHECK (octet_length("mmr"."command_receipts"."key_hash") = 32),
	CONSTRAINT "mmr_command_receipts_request_hash" CHECK (octet_length("mmr"."command_receipts"."request_hash") = 32),
	CONSTRAINT "mmr_command_receipts_status_success" CHECK ("mmr"."command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "mmr_command_receipts_expiry" CHECK ("mmr"."command_receipts"."expires_at" > "mmr"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "mmr"."consumer_receipts" (
	"outbox_event_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"generation" bigint NOT NULL,
	"match_id" uuid NOT NULL,
	"match_revision" bigint NOT NULL,
	"input_digest" "bytea" NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mmr_consumer_receipts_generation_positive" CHECK ("mmr"."consumer_receipts"."generation" > 0),
	CONSTRAINT "mmr_consumer_receipts_revision_nonnegative" CHECK ("mmr"."consumer_receipts"."match_revision" >= 0),
	CONSTRAINT "mmr_consumer_receipts_digest" CHECK (octet_length("mmr"."consumer_receipts"."input_digest") = 32)
);
--> statement-breakpoint
CREATE TABLE "mmr"."manual_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"position" "competition"."match_position",
	"delta_bp" integer NOT NULL,
	"reason_code" varchar(64) NOT NULL,
	"public_note" varchar(300) NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mmr_adjustments_delta_range" CHECK ("mmr"."manual_adjustments"."delta_bp" BETWEEN -1000 AND 1000),
	CONSTRAINT "mmr_adjustments_reason_nonempty" CHECK (char_length(btrim("mmr"."manual_adjustments"."reason_code")) BETWEEN 1 AND 64),
	CONSTRAINT "mmr_adjustments_note_nonempty" CHECK (char_length(btrim("mmr"."manual_adjustments"."public_note")) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "mmr"."match_result_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"generation" bigint NOT NULL,
	"source_event_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"team" varchar(8) NOT NULL,
	"position" "competition"."match_position" NOT NULL,
	"won" boolean NOT NULL,
	"expected_win_rate_bp" integer NOT NULL,
	"actual_performance_bp" integer NOT NULL,
	"overall_delta_bp" integer NOT NULL,
	"position_delta_bp" integer NOT NULL,
	"formula_version" varchar(48) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mmr_match_events_generation_positive" CHECK ("mmr"."match_result_events"."generation" > 0),
	CONSTRAINT "mmr_match_events_team_allowed" CHECK ("mmr"."match_result_events"."team" IN ('BLUE', 'RED')),
	CONSTRAINT "mmr_match_events_expected_range" CHECK ("mmr"."match_result_events"."expected_win_rate_bp" BETWEEN 1 AND 9999),
	CONSTRAINT "mmr_match_events_delta_range" CHECK ("mmr"."match_result_events"."overall_delta_bp" BETWEEN -600 AND 600 AND "mmr"."match_result_events"."position_delta_bp" BETWEEN -700 AND 700)
);
--> statement-breakpoint
CREATE TABLE "mmr"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"generation" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"status" "mmr"."outbox_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "mmr_outbox_generation_positive" CHECK ("mmr"."outbox"."generation" > 0),
	CONSTRAINT "mmr_outbox_delivery" CHECK (("mmr"."outbox"."status" = 'PENDING' AND "mmr"."outbox"."delivered_at" IS NULL) OR ("mmr"."outbox"."status" = 'DELIVERED' AND "mmr"."outbox"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mmr"."player_position_profiles" (
	"generation" bigint NOT NULL,
	"player_id" uuid NOT NULL,
	"position" "competition"."match_position" NOT NULL,
	"score_bp" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_position_profiles_generation_player_id_position_pk" PRIMARY KEY("generation","player_id","position"),
	CONSTRAINT "mmr_position_profiles_generation_positive" CHECK ("mmr"."player_position_profiles"."generation" > 0),
	CONSTRAINT "mmr_position_profiles_score_range" CHECK ("mmr"."player_position_profiles"."score_bp" BETWEEN 100 AND 10000),
	CONSTRAINT "mmr_position_profiles_sample_nonnegative" CHECK ("mmr"."player_position_profiles"."sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mmr"."player_profiles" (
	"generation" bigint NOT NULL,
	"player_id" uuid NOT NULL,
	"overall_score_bp" integer NOT NULL,
	"confidence_bp" integer NOT NULL,
	"sample_size" integer NOT NULL,
	"formula_version" varchar(48) NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_profiles_generation_player_id_pk" PRIMARY KEY("generation","player_id"),
	CONSTRAINT "mmr_player_profiles_generation_positive" CHECK ("mmr"."player_profiles"."generation" > 0),
	CONSTRAINT "mmr_player_profiles_score_range" CHECK ("mmr"."player_profiles"."overall_score_bp" BETWEEN 100 AND 10000),
	CONSTRAINT "mmr_player_profiles_confidence_range" CHECK ("mmr"."player_profiles"."confidence_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "mmr_player_profiles_sample_nonnegative" CHECK ("mmr"."player_profiles"."sample_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mmr"."projection_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trigger" "mmr"."projection_trigger" NOT NULL,
	"actor_user_account_id" uuid,
	"base_generation" bigint NOT NULL,
	"result_generation" bigint NOT NULL,
	"source_match_count" integer NOT NULL,
	"source_game_count" integer NOT NULL,
	"source_adjustment_count" integer NOT NULL,
	"source_checksum" "bytea" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mmr_projection_runs_generation_step" CHECK ("mmr"."projection_runs"."base_generation" >= 0 AND "mmr"."projection_runs"."result_generation" = "mmr"."projection_runs"."base_generation" + 1),
	CONSTRAINT "mmr_projection_runs_counts_nonnegative" CHECK ("mmr"."projection_runs"."source_match_count" >= 0 AND "mmr"."projection_runs"."source_game_count" >= 0 AND "mmr"."projection_runs"."source_adjustment_count" >= 0),
	CONSTRAINT "mmr_projection_runs_checksum" CHECK (octet_length("mmr"."projection_runs"."source_checksum") = 32),
	CONSTRAINT "mmr_projection_runs_time_order" CHECK ("mmr"."projection_runs"."completed_at" >= "mmr"."projection_runs"."started_at"),
	CONSTRAINT "mmr_projection_runs_actor_consistency" CHECK (("mmr"."projection_runs"."trigger" IN ('ADMIN', 'ADJUSTMENT') AND "mmr"."projection_runs"."actor_user_account_id" IS NOT NULL) OR ("mmr"."projection_runs"."trigger" IN ('BOOTSTRAP', 'CATCH_UP') AND "mmr"."projection_runs"."actor_user_account_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "mmr"."projection_states" (
	"key" varchar(16) PRIMARY KEY NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"status" "mmr"."projection_status" DEFAULT 'EMPTY' NOT NULL,
	"formula_version" varchar(48),
	"source_match_count" integer DEFAULT 0 NOT NULL,
	"source_game_count" integer DEFAULT 0 NOT NULL,
	"source_adjustment_count" integer DEFAULT 0 NOT NULL,
	"source_checksum" "bytea",
	"calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mmr_projection_states_global_key" CHECK ("mmr"."projection_states"."key" = 'GLOBAL'),
	CONSTRAINT "mmr_projection_states_generation_nonnegative" CHECK ("mmr"."projection_states"."generation" >= 0),
	CONSTRAINT "mmr_projection_states_counts_nonnegative" CHECK ("mmr"."projection_states"."source_match_count" >= 0 AND "mmr"."projection_states"."source_game_count" >= 0 AND "mmr"."projection_states"."source_adjustment_count" >= 0),
	CONSTRAINT "mmr_projection_states_lifecycle" CHECK ((
        ("mmr"."projection_states"."status" = 'EMPTY' AND "mmr"."projection_states"."generation" = 0 AND "mmr"."projection_states"."formula_version" IS NULL AND "mmr"."projection_states"."source_checksum" IS NULL AND "mmr"."projection_states"."calculated_at" IS NULL)
        OR
        ("mmr"."projection_states"."status" = 'READY' AND "mmr"."projection_states"."generation" > 0 AND char_length("mmr"."projection_states"."formula_version") > 0 AND octet_length("mmr"."projection_states"."source_checksum") = 32 AND "mmr"."projection_states"."calculated_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "mmr"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."consumer_receipts" ADD CONSTRAINT "consumer_receipts_outbox_event_id_match_recalculation_outbox_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "competition"."match_recalculation_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."consumer_receipts" ADD CONSTRAINT "consumer_receipts_run_id_projection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "mmr"."projection_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."consumer_receipts" ADD CONSTRAINT "consumer_receipts_match_id_match_series_id_fk" FOREIGN KEY ("match_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."manual_adjustments" ADD CONSTRAINT "manual_adjustments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."manual_adjustments" ADD CONSTRAINT "manual_adjustments_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" ADD CONSTRAINT "match_result_events_source_event_id_match_series_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" ADD CONSTRAINT "match_result_events_match_id_match_series_id_fk" FOREIGN KEY ("match_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" ADD CONSTRAINT "match_result_events_game_id_match_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "competition"."match_games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" ADD CONSTRAINT "match_result_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."outbox" ADD CONSTRAINT "outbox_run_id_projection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "mmr"."projection_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."player_position_profiles" ADD CONSTRAINT "player_position_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."player_profiles" ADD CONSTRAINT "player_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."projection_runs" ADD CONSTRAINT "projection_runs_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mmr_command_receipts_actor_scope_key_uidx" ON "mmr"."command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "mmr_command_receipts_expires_idx" ON "mmr"."command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mmr_consumer_receipts_match_revision_idx" ON "mmr"."consumer_receipts" USING btree ("match_id","match_revision");--> statement-breakpoint
CREATE INDEX "mmr_adjustments_player_created_idx" ON "mmr"."manual_adjustments" USING btree ("player_id","created_at","id");--> statement-breakpoint
CREATE INDEX "mmr_adjustments_created_idx" ON "mmr"."manual_adjustments" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "mmr_match_events_generation_game_player_uidx" ON "mmr"."match_result_events" USING btree ("generation","game_id","player_id");--> statement-breakpoint
CREATE INDEX "mmr_match_events_player_generation_idx" ON "mmr"."match_result_events" USING btree ("player_id","generation","game_number");--> statement-breakpoint
CREATE UNIQUE INDEX "mmr_outbox_request_uidx" ON "mmr"."outbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "mmr_outbox_pending_idx" ON "mmr"."outbox" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "mmr_position_profiles_player_generation_idx" ON "mmr"."player_position_profiles" USING btree ("player_id","generation");--> statement-breakpoint
CREATE INDEX "mmr_player_profiles_generation_score_idx" ON "mmr"."player_profiles" USING btree ("generation","overall_score_bp" DESC NULLS LAST,"player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mmr_projection_runs_generation_uidx" ON "mmr"."projection_runs" USING btree ("result_generation");--> statement-breakpoint
CREATE INDEX "mmr_projection_runs_completed_idx" ON "mmr"."projection_runs" USING btree ("completed_at","id");