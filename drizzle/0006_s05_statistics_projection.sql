CREATE SCHEMA "statistics";
--> statement-breakpoint
CREATE TYPE "statistics"."season_projection_status" AS ENUM('EMPTY', 'READY');--> statement-breakpoint
CREATE TYPE "statistics"."statistics_projection_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "statistics"."statistics_projection_run_trigger" AS ENUM('OUTBOX', 'ADMIN', 'BOOTSTRAP');--> statement-breakpoint
CREATE TABLE "statistics"."match_projection_receipts" (
	"outbox_event_id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"match_revision" bigint NOT NULL,
	"action" varchar(32) NOT NULL,
	"old_season_id" uuid,
	"new_season_id" uuid,
	"input_digest" "bytea" NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_projection_receipts_revision_nonnegative" CHECK ("statistics"."match_projection_receipts"."match_revision" >= 0),
	CONSTRAINT "match_projection_receipts_digest_32_bytes" CHECK (octet_length("statistics"."match_projection_receipts"."input_digest") = 32),
	CONSTRAINT "match_projection_receipts_action_allowed" CHECK ("statistics"."match_projection_receipts"."action" IN ('CREATED', 'AMENDED', 'PUBLISHED', 'VOIDED', 'RESTORED'))
);
--> statement-breakpoint
CREATE TABLE "statistics"."player_champion_stats" (
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"champion_key" varchar(64) NOT NULL,
	"generation" bigint NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"mvp_count" integer NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_champion_stats_season_id_player_id_champion_key_pk" PRIMARY KEY("season_id","player_id","champion_key"),
	CONSTRAINT "player_champion_stats_generation_positive" CHECK ("statistics"."player_champion_stats"."generation" > 0),
	CONSTRAINT "player_champion_stats_counts_nonnegative" CHECK ("statistics"."player_champion_stats"."games" >= 0 AND "statistics"."player_champion_stats"."wins" >= 0 AND "statistics"."player_champion_stats"."losses" >= 0 AND "statistics"."player_champion_stats"."mvp_count" >= 0),
	CONSTRAINT "player_champion_stats_win_loss_total" CHECK ("statistics"."player_champion_stats"."wins" + "statistics"."player_champion_stats"."losses" = "statistics"."player_champion_stats"."games"),
	CONSTRAINT "player_champion_stats_mvp_bounded" CHECK ("statistics"."player_champion_stats"."mvp_count" <= "statistics"."player_champion_stats"."games")
);
--> statement-breakpoint
CREATE TABLE "statistics"."player_position_stats" (
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" "competition"."match_position" NOT NULL,
	"generation" bigint NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_position_stats_season_id_player_id_position_pk" PRIMARY KEY("season_id","player_id","position"),
	CONSTRAINT "player_position_stats_generation_positive" CHECK ("statistics"."player_position_stats"."generation" > 0),
	CONSTRAINT "player_position_stats_counts_nonnegative" CHECK ("statistics"."player_position_stats"."games" >= 0 AND "statistics"."player_position_stats"."wins" >= 0 AND "statistics"."player_position_stats"."losses" >= 0),
	CONSTRAINT "player_position_stats_win_loss_total" CHECK ("statistics"."player_position_stats"."wins" + "statistics"."player_position_stats"."losses" = "statistics"."player_position_stats"."games")
);
--> statement-breakpoint
CREATE TABLE "statistics"."player_season_stats" (
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"generation" bigint NOT NULL,
	"total_games" integer NOT NULL,
	"participation_count" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"mvp_count" integer NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_season_stats_season_id_player_id_pk" PRIMARY KEY("season_id","player_id"),
	CONSTRAINT "player_season_stats_generation_positive" CHECK ("statistics"."player_season_stats"."generation" > 0),
	CONSTRAINT "player_season_stats_counts_nonnegative" CHECK ("statistics"."player_season_stats"."total_games" >= 0 AND "statistics"."player_season_stats"."participation_count" >= 0 AND "statistics"."player_season_stats"."wins" >= 0 AND "statistics"."player_season_stats"."losses" >= 0 AND "statistics"."player_season_stats"."mvp_count" >= 0),
	CONSTRAINT "player_season_stats_win_loss_total" CHECK ("statistics"."player_season_stats"."wins" + "statistics"."player_season_stats"."losses" = "statistics"."player_season_stats"."total_games"),
	CONSTRAINT "player_season_stats_participation_bounded" CHECK ("statistics"."player_season_stats"."participation_count" <= "statistics"."player_season_stats"."total_games"),
	CONSTRAINT "player_season_stats_mvp_bounded" CHECK ("statistics"."player_season_stats"."mvp_count" <= "statistics"."player_season_stats"."total_games")
);
--> statement-breakpoint
CREATE TABLE "statistics"."season_projection_states" (
	"season_id" uuid PRIMARY KEY NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"status" "statistics"."season_projection_status" DEFAULT 'EMPTY' NOT NULL,
	"source_match_count" integer DEFAULT 0 NOT NULL,
	"source_game_count" integer DEFAULT 0 NOT NULL,
	"source_participant_count" integer DEFAULT 0 NOT NULL,
	"source_checksum" "bytea",
	"calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_projection_states_generation_nonnegative" CHECK ("statistics"."season_projection_states"."generation" >= 0),
	CONSTRAINT "season_projection_states_source_counts_nonnegative" CHECK ("statistics"."season_projection_states"."source_match_count" >= 0 AND "statistics"."season_projection_states"."source_game_count" >= 0 AND "statistics"."season_projection_states"."source_participant_count" >= 0),
	CONSTRAINT "season_projection_states_lifecycle_consistency" CHECK ((
        ("statistics"."season_projection_states"."status" = 'EMPTY' AND "statistics"."season_projection_states"."generation" = 0 AND "statistics"."season_projection_states"."source_checksum" IS NULL AND "statistics"."season_projection_states"."calculated_at" IS NULL)
        OR
        ("statistics"."season_projection_states"."status" = 'READY' AND "statistics"."season_projection_states"."generation" > 0 AND "statistics"."season_projection_states"."source_checksum" IS NOT NULL AND octet_length("statistics"."season_projection_states"."source_checksum") = 32 AND "statistics"."season_projection_states"."calculated_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "statistics"."projection_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"trigger" "statistics"."statistics_projection_run_trigger" NOT NULL,
	"status" "statistics"."statistics_projection_run_status" DEFAULT 'RUNNING' NOT NULL,
	"requested_outbox_event_id" uuid,
	"base_generation" bigint NOT NULL,
	"result_generation" bigint,
	"source_match_count" integer DEFAULT 0 NOT NULL,
	"source_game_count" integer DEFAULT 0 NOT NULL,
	"source_participant_count" integer DEFAULT 0 NOT NULL,
	"source_checksum" "bytea",
	"failure_code" varchar(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "projection_runs_base_generation_nonnegative" CHECK ("statistics"."projection_runs"."base_generation" >= 0),
	CONSTRAINT "projection_runs_source_counts_nonnegative" CHECK ("statistics"."projection_runs"."source_match_count" >= 0 AND "statistics"."projection_runs"."source_game_count" >= 0 AND "statistics"."projection_runs"."source_participant_count" >= 0),
	CONSTRAINT "projection_runs_trigger_source_consistency" CHECK (("statistics"."projection_runs"."trigger" = 'OUTBOX' AND "statistics"."projection_runs"."requested_outbox_event_id" IS NOT NULL) OR ("statistics"."projection_runs"."trigger" IN ('ADMIN', 'BOOTSTRAP') AND "statistics"."projection_runs"."requested_outbox_event_id" IS NULL)),
	CONSTRAINT "projection_runs_lifecycle_consistency" CHECK ((
        ("statistics"."projection_runs"."status" = 'RUNNING' AND "statistics"."projection_runs"."result_generation" IS NULL AND "statistics"."projection_runs"."source_checksum" IS NULL AND "statistics"."projection_runs"."failure_code" IS NULL AND "statistics"."projection_runs"."completed_at" IS NULL)
        OR
        ("statistics"."projection_runs"."status" = 'SUCCEEDED' AND "statistics"."projection_runs"."result_generation" = "statistics"."projection_runs"."base_generation" + 1 AND "statistics"."projection_runs"."source_checksum" IS NOT NULL AND octet_length("statistics"."projection_runs"."source_checksum") = 32 AND "statistics"."projection_runs"."failure_code" IS NULL AND "statistics"."projection_runs"."completed_at" IS NOT NULL)
        OR
        ("statistics"."projection_runs"."status" = 'FAILED' AND "statistics"."projection_runs"."result_generation" IS NULL AND "statistics"."projection_runs"."source_checksum" IS NULL AND "statistics"."projection_runs"."failure_code" IS NOT NULL AND char_length("statistics"."projection_runs"."failure_code") BETWEEN 1 AND 64 AND "statistics"."projection_runs"."completed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "statistics"."match_projection_receipts" ADD CONSTRAINT "match_projection_receipts_outbox_event_id_match_recalculation_outbox_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "competition"."match_recalculation_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."match_projection_receipts" ADD CONSTRAINT "match_projection_receipts_match_id_match_series_id_fk" FOREIGN KEY ("match_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."match_projection_receipts" ADD CONSTRAINT "match_projection_receipts_old_season_id_seasons_id_fk" FOREIGN KEY ("old_season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."match_projection_receipts" ADD CONSTRAINT "match_projection_receipts_new_season_id_seasons_id_fk" FOREIGN KEY ("new_season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_champion_stats" ADD CONSTRAINT "player_champion_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_champion_stats" ADD CONSTRAINT "player_champion_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_champion_stats" ADD CONSTRAINT "player_champion_stats_champion_key_champions_key_fk" FOREIGN KEY ("champion_key") REFERENCES "catalog"."champions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_position_stats" ADD CONSTRAINT "player_position_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_position_stats" ADD CONSTRAINT "player_position_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_season_stats" ADD CONSTRAINT "player_season_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."season_projection_states" ADD CONSTRAINT "season_projection_states_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."projection_runs" ADD CONSTRAINT "projection_runs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistics"."projection_runs" ADD CONSTRAINT "projection_runs_requested_outbox_event_id_match_recalculation_outbox_id_fk" FOREIGN KEY ("requested_outbox_event_id") REFERENCES "competition"."match_recalculation_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_projection_receipts_match_revision_idx" ON "statistics"."match_projection_receipts" USING btree ("match_id","match_revision");--> statement-breakpoint
CREATE INDEX "player_champion_stats_player_games_idx" ON "statistics"."player_champion_stats" USING btree ("player_id","season_id","games","champion_key");--> statement-breakpoint
CREATE INDEX "player_champion_stats_champion_idx" ON "statistics"."player_champion_stats" USING btree ("champion_key","season_id");--> statement-breakpoint
CREATE INDEX "player_position_stats_player_games_idx" ON "statistics"."player_position_stats" USING btree ("player_id","season_id","games","position");--> statement-breakpoint
CREATE INDEX "player_season_stats_ranking_idx" ON "statistics"."player_season_stats" USING btree ("season_id","participation_count","wins","total_games","mvp_count","player_id");--> statement-breakpoint
CREATE INDEX "season_projection_states_status_updated_idx" ON "statistics"."season_projection_states" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projection_runs_outbox_season_uidx" ON "statistics"."projection_runs" USING btree ("requested_outbox_event_id","season_id") WHERE "statistics"."projection_runs"."requested_outbox_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "projection_runs_season_started_idx" ON "statistics"."projection_runs" USING btree ("season_id","started_at","id");--> statement-breakpoint
CREATE INDEX "projection_runs_status_started_idx" ON "statistics"."projection_runs" USING btree ("status","started_at");
