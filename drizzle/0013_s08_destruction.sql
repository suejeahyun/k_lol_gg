CREATE TYPE "competition"."destruction_application_status" AS ENUM('APPLIED', 'CONFIRMED', 'RESERVE', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "competition"."destruction_competition_status" AS ENUM('PLANNED', 'RECRUITING', 'TEAM_BUILDING', 'AUCTION', 'PRELIMINARY', 'TOURNAMENT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "competition"."destruction_outbox_status" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "competition"."destruction_position" AS ENUM('TOP', 'JGL', 'MID', 'ADC', 'SUP');--> statement-breakpoint
CREATE TYPE "competition"."destruction_preliminary_format" AS ENUM('FULL_ROUND_ROBIN_BO3', 'FULL_ROUND_ROBIN_BO1', 'GROUP_ROUND_ROBIN_BO3', 'GROUP_ROUND_ROBIN_BO1', 'SWISS_ROUND_BO3', 'SWISS_ROUND_BO1', 'RANDOM_ROUNDS_BO3', 'RANDOM_ROUNDS_BO1');--> statement-breakpoint
CREATE TABLE "competition"."destruction_application_index" (
	"tournament_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" "competition"."destruction_position" NOT NULL,
	"status" "competition"."destruction_application_status" NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "destruction_application_index_tournament_id_application_id_pk" PRIMARY KEY("tournament_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "competition"."destruction_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tournament_id" uuid NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "destruction_receipts_key_hash" CHECK (octet_length("competition"."destruction_command_receipts"."key_hash") = 32),
	CONSTRAINT "destruction_receipts_request_hash" CHECK (octet_length("competition"."destruction_command_receipts"."request_hash") = 32),
	CONSTRAINT "destruction_receipts_success" CHECK ("competition"."destruction_command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "destruction_receipts_revision_positive" CHECK ("competition"."destruction_command_receipts"."revision" > 0),
	CONSTRAINT "destruction_receipts_expiry" CHECK ("competition"."destruction_command_receipts"."expires_at" > "competition"."destruction_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "competition"."destruction_competitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"title_normalized" varchar(120) NOT NULL,
	"status" "competition"."destruction_competition_status" NOT NULL,
	"preliminary_format" "competition"."destruction_preliminary_format" NOT NULL,
	"team_count" integer NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"aggregate_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_by_user_account_id" uuid NOT NULL,
	"updated_by_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "destruction_competitions_title_nonempty" CHECK (char_length(btrim("competition"."destruction_competitions"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "destruction_competitions_team_count" CHECK ("competition"."destruction_competitions"."team_count" BETWEEN 4 AND 99),
	CONSTRAINT "destruction_competitions_participant_count" CHECK ("competition"."destruction_competitions"."participant_count" BETWEEN 0 AND "competition"."destruction_competitions"."team_count" * 5),
	CONSTRAINT "destruction_competitions_revision_positive" CHECK ("competition"."destruction_competitions"."revision" > 0),
	CONSTRAINT "destruction_competitions_snapshot_object" CHECK (jsonb_typeof("competition"."destruction_competitions"."aggregate_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "competition"."destruction_outbox" (
	"id" varchar(180) PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "competition"."destruction_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "destruction_outbox_revision_positive" CHECK ("competition"."destruction_outbox"."aggregate_revision" > 0),
	CONSTRAINT "destruction_outbox_attempt_nonnegative" CHECK ("competition"."destruction_outbox"."attempt_count" >= 0),
	CONSTRAINT "destruction_outbox_payload_object" CHECK (jsonb_typeof("competition"."destruction_outbox"."payload_json") = 'object'),
	CONSTRAINT "destruction_outbox_delivery_consistency" CHECK (("competition"."destruction_outbox"."status" = 'DELIVERED' AND "competition"."destruction_outbox"."delivered_at" IS NOT NULL) OR ("competition"."destruction_outbox"."status" <> 'DELIVERED' AND "competition"."destruction_outbox"."delivered_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "competition"."destruction_application_index" ADD CONSTRAINT "destruction_application_index_tournament_id_destruction_competitions_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "competition"."destruction_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_application_index" ADD CONSTRAINT "destruction_application_index_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_application_index" ADD CONSTRAINT "destruction_application_index_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_command_receipts" ADD CONSTRAINT "destruction_command_receipts_tournament_id_destruction_competitions_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "competition"."destruction_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_command_receipts" ADD CONSTRAINT "destruction_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_competitions" ADD CONSTRAINT "destruction_competitions_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_competitions" ADD CONSTRAINT "destruction_competitions_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."destruction_outbox" ADD CONSTRAINT "destruction_outbox_tournament_id_destruction_competitions_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "competition"."destruction_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_application_owner_uidx" ON "competition"."destruction_application_index" USING btree ("tournament_id","owner_user_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_application_player_uidx" ON "competition"."destruction_application_index" USING btree ("tournament_id","player_id");--> statement-breakpoint
CREATE INDEX "destruction_application_owner_idx" ON "competition"."destruction_application_index" USING btree ("owner_user_account_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_receipts_actor_scope_key_uidx" ON "competition"."destruction_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "destruction_receipts_expires_idx" ON "competition"."destruction_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "destruction_competitions_public_idx" ON "competition"."destruction_competitions" USING btree ("status","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "destruction_competitions_title_idx" ON "competition"."destruction_competitions" USING btree ("title_normalized","id");--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_outbox_request_uidx" ON "competition"."destruction_outbox" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "destruction_outbox_dedupe_uidx" ON "competition"."destruction_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "destruction_outbox_pending_idx" ON "competition"."destruction_outbox" USING btree ("status","created_at","id");