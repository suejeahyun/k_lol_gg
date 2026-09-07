CREATE TYPE "competition"."event_competition_format" AS ENUM('POSITION', 'ARAM');--> statement-breakpoint
CREATE TYPE "competition"."event_competition_status" AS ENUM('PLANNED', 'RECRUITING', 'TEAM_BUILDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "competition"."event_outbox_status" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "competition"."event_participant_source" AS ENUM('USER_APPLICATION', 'ADMIN_IMPORT', 'ADMIN_MANUAL');--> statement-breakpoint
CREATE TYPE "competition"."event_participant_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "competition"."event_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "event_receipts_key_hash" CHECK (octet_length("competition"."event_command_receipts"."key_hash") = 32),
	CONSTRAINT "event_receipts_request_hash" CHECK (octet_length("competition"."event_command_receipts"."request_hash") = 32),
	CONSTRAINT "event_receipts_success" CHECK ("competition"."event_command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "event_receipts_revision_positive" CHECK ("competition"."event_command_receipts"."revision" > 0),
	CONSTRAINT "event_receipts_expiry" CHECK ("competition"."event_command_receipts"."expires_at" > "competition"."event_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "competition"."event_competitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"title_normalized" varchar(120) NOT NULL,
	"description" varchar(2000),
	"format" "competition"."event_competition_format" NOT NULL,
	"status" "competition"."event_competition_status" NOT NULL,
	"recruitment_opens_at" timestamp with time zone NOT NULL,
	"recruitment_closes_at" timestamp with time zone NOT NULL,
	"bracket_best_of" integer NOT NULL,
	"active_participant_count" integer DEFAULT 0 NOT NULL,
	"aggregate_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"created_by_user_account_id" uuid NOT NULL,
	"updated_by_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "event_competitions_title_nonempty" CHECK (char_length(btrim("competition"."event_competitions"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "event_competitions_window_order" CHECK ("competition"."event_competitions"."recruitment_closes_at" > "competition"."event_competitions"."recruitment_opens_at"),
	CONSTRAINT "event_competitions_best_of" CHECK ("competition"."event_competitions"."bracket_best_of" BETWEEN 1 AND 9 AND ("competition"."event_competitions"."bracket_best_of" % 2) = 1),
	CONSTRAINT "event_competitions_participant_count" CHECK ("competition"."event_competitions"."active_participant_count" BETWEEN 0 AND 10),
	CONSTRAINT "event_competitions_revision_positive" CHECK ("competition"."event_competitions"."revision" > 0),
	CONSTRAINT "event_competitions_snapshot_object" CHECK (jsonb_typeof("competition"."event_competitions"."aggregate_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "competition"."event_outbox" (
	"id" varchar(180) PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "competition"."event_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "event_outbox_revision_positive" CHECK ("competition"."event_outbox"."aggregate_revision" > 0),
	CONSTRAINT "event_outbox_attempt_nonnegative" CHECK ("competition"."event_outbox"."attempt_count" >= 0),
	CONSTRAINT "event_outbox_payload_object" CHECK (jsonb_typeof("competition"."event_outbox"."payload_json") = 'object'),
	CONSTRAINT "event_outbox_delivery_consistency" CHECK (("competition"."event_outbox"."status" = 'DELIVERED' AND "competition"."event_outbox"."delivered_at" IS NOT NULL) OR ("competition"."event_outbox"."status" <> 'DELIVERED' AND "competition"."event_outbox"."delivered_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "competition"."event_participant_index" (
	"event_id" uuid NOT NULL,
	"participant_id" varchar(180) NOT NULL,
	"player_id" uuid NOT NULL,
	"owner_user_account_id" uuid,
	"source" "competition"."event_participant_source" NOT NULL,
	"status" "competition"."event_participant_status" NOT NULL,
	"main_position" varchar(3),
	"sub_positions_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "event_participant_index_event_id_participant_id_pk" PRIMARY KEY("event_id","participant_id"),
	CONSTRAINT "event_participant_sub_positions_array" CHECK (jsonb_typeof("competition"."event_participant_index"."sub_positions_json") = 'array' AND jsonb_array_length("competition"."event_participant_index"."sub_positions_json") <= 4)
);
--> statement-breakpoint
ALTER TABLE "competition"."event_command_receipts" ADD CONSTRAINT "event_command_receipts_event_id_event_competitions_id_fk" FOREIGN KEY ("event_id") REFERENCES "competition"."event_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_command_receipts" ADD CONSTRAINT "event_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_competitions" ADD CONSTRAINT "event_competitions_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_competitions" ADD CONSTRAINT "event_competitions_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_outbox" ADD CONSTRAINT "event_outbox_event_id_event_competitions_id_fk" FOREIGN KEY ("event_id") REFERENCES "competition"."event_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_participant_index" ADD CONSTRAINT "event_participant_index_event_id_event_competitions_id_fk" FOREIGN KEY ("event_id") REFERENCES "competition"."event_competitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_participant_index" ADD CONSTRAINT "event_participant_index_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."event_participant_index" ADD CONSTRAINT "event_participant_index_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_receipts_actor_scope_key_uidx" ON "competition"."event_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "event_receipts_expires_idx" ON "competition"."event_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "event_competitions_public_idx" ON "competition"."event_competitions" USING btree ("status","recruitment_opens_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "event_competitions_title_idx" ON "competition"."event_competitions" USING btree ("title_normalized","id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_outbox_request_uidx" ON "competition"."event_outbox" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_outbox_dedupe_uidx" ON "competition"."event_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "competition"."event_outbox" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participant_event_player_uidx" ON "competition"."event_participant_index" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participant_event_owner_uidx" ON "competition"."event_participant_index" USING btree ("event_id","owner_user_account_id") WHERE "competition"."event_participant_index"."owner_user_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "event_participant_owner_idx" ON "competition"."event_participant_index" USING btree ("owner_user_account_id","updated_at" DESC NULLS LAST);