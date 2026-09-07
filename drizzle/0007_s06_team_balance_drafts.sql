CREATE SCHEMA "team_tools";
--> statement-breakpoint
CREATE TYPE "team_tools"."team_balance_candidate_source" AS ENUM('AUTO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "team_tools"."team_balance_draft_status" AS ENUM('EVALUATED', 'SAVED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "team_tools"."team_balance_outbox_status" AS ENUM('PENDING', 'DELIVERED');--> statement-breakpoint
CREATE TABLE "team_tools"."team_balance_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "team_balance_receipts_key_hash" CHECK (octet_length("team_tools"."team_balance_command_receipts"."key_hash") = 32),
	CONSTRAINT "team_balance_receipts_request_hash" CHECK (octet_length("team_tools"."team_balance_command_receipts"."request_hash") = 32),
	CONSTRAINT "team_balance_receipts_status_success" CHECK ("team_tools"."team_balance_command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "team_balance_receipts_expiry" CHECK ("team_tools"."team_balance_command_receipts"."expires_at" > "team_tools"."team_balance_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "team_tools"."team_balance_draft_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"evaluation_round" integer NOT NULL,
	"source" "team_tools"."team_balance_candidate_source" NOT NULL,
	"rank" integer,
	"signature" varchar(500) NOT NULL,
	"assignments_json" jsonb NOT NULL,
	"score_json" jsonb NOT NULL,
	"created_by_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_balance_candidates_round_positive" CHECK ("team_tools"."team_balance_draft_candidates"."evaluation_round" > 0),
	CONSTRAINT "team_balance_candidates_source_rank" CHECK (("team_tools"."team_balance_draft_candidates"."source" = 'AUTO' AND "team_tools"."team_balance_draft_candidates"."rank" BETWEEN 1 AND 3) OR ("team_tools"."team_balance_draft_candidates"."source" = 'MANUAL' AND "team_tools"."team_balance_draft_candidates"."rank" IS NULL)),
	CONSTRAINT "team_balance_candidates_assignments_exact" CHECK (jsonb_typeof("team_tools"."team_balance_draft_candidates"."assignments_json") = 'array' AND jsonb_array_length("team_tools"."team_balance_draft_candidates"."assignments_json") = 10),
	CONSTRAINT "team_balance_candidates_score_object" CHECK (jsonb_typeof("team_tools"."team_balance_draft_candidates"."score_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "team_tools"."team_balance_draft_participants" (
	"draft_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"display_name_snapshot" varchar(96) NOT NULL,
	"eligible_positions_json" jsonb NOT NULL,
	"rating_snapshot_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_balance_draft_participants_draft_id_player_id_pk" PRIMARY KEY("draft_id","player_id"),
	CONSTRAINT "team_balance_participants_ordinal_range" CHECK ("team_tools"."team_balance_draft_participants"."ordinal" BETWEEN 0 AND 9),
	CONSTRAINT "team_balance_participants_eligible_array" CHECK (jsonb_typeof("team_tools"."team_balance_draft_participants"."eligible_positions_json") = 'array' AND jsonb_array_length("team_tools"."team_balance_draft_participants"."eligible_positions_json") BETWEEN 1 AND 5),
	CONSTRAINT "team_balance_participants_rating_object" CHECK (jsonb_typeof("team_tools"."team_balance_draft_participants"."rating_snapshot_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "team_tools"."team_balance_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"status" "team_tools"."team_balance_draft_status" DEFAULT 'EVALUATED' NOT NULL,
	"evaluation_round" integer DEFAULT 1 NOT NULL,
	"rating_generation" bigint,
	"selected_candidate_source" "team_tools"."team_balance_candidate_source",
	"selected_candidate_signature" varchar(500),
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_by_user_account_id" uuid NOT NULL,
	"updated_by_user_account_id" uuid NOT NULL,
	"saved_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_balance_drafts_title_nonempty" CHECK (char_length(btrim("team_tools"."team_balance_drafts"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "team_balance_drafts_revision_nonnegative" CHECK ("team_tools"."team_balance_drafts"."revision" >= 0),
	CONSTRAINT "team_balance_drafts_evaluation_round_positive" CHECK ("team_tools"."team_balance_drafts"."evaluation_round" > 0),
	CONSTRAINT "team_balance_drafts_selection_pair" CHECK (("team_tools"."team_balance_drafts"."selected_candidate_source" IS NULL) = ("team_tools"."team_balance_drafts"."selected_candidate_signature" IS NULL)),
	CONSTRAINT "team_balance_drafts_lifecycle_consistency" CHECK ((
        ("team_tools"."team_balance_drafts"."status" = 'EVALUATED' AND "team_tools"."team_balance_drafts"."saved_at" IS NULL AND "team_tools"."team_balance_drafts"."archived_at" IS NULL)
        OR ("team_tools"."team_balance_drafts"."status" = 'SAVED' AND "team_tools"."team_balance_drafts"."saved_at" IS NOT NULL AND "team_tools"."team_balance_drafts"."archived_at" IS NULL AND "team_tools"."team_balance_drafts"."selected_candidate_signature" IS NOT NULL)
        OR ("team_tools"."team_balance_drafts"."status" = 'ARCHIVED' AND "team_tools"."team_balance_drafts"."archived_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "team_tools"."team_balance_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_revision" bigint NOT NULL,
	"request_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "team_tools"."team_balance_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "team_balance_outbox_revision_nonnegative" CHECK ("team_tools"."team_balance_outbox"."draft_revision" >= 0),
	CONSTRAINT "team_balance_outbox_payload_object" CHECK (jsonb_typeof("team_tools"."team_balance_outbox"."payload_json") = 'object'),
	CONSTRAINT "team_balance_outbox_delivery_consistency" CHECK (("team_tools"."team_balance_outbox"."status" = 'PENDING' AND "team_tools"."team_balance_outbox"."delivered_at" IS NULL) OR ("team_tools"."team_balance_outbox"."status" = 'DELIVERED' AND "team_tools"."team_balance_outbox"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_command_receipts" ADD CONSTRAINT "team_balance_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_draft_candidates" ADD CONSTRAINT "team_balance_draft_candidates_draft_id_team_balance_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "team_tools"."team_balance_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_draft_candidates" ADD CONSTRAINT "team_balance_draft_candidates_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_draft_participants" ADD CONSTRAINT "team_balance_draft_participants_draft_id_team_balance_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "team_tools"."team_balance_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_draft_participants" ADD CONSTRAINT "team_balance_draft_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_drafts" ADD CONSTRAINT "team_balance_drafts_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_drafts" ADD CONSTRAINT "team_balance_drafts_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_drafts" ADD CONSTRAINT "team_balance_drafts_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_outbox" ADD CONSTRAINT "team_balance_outbox_draft_id_team_balance_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "team_tools"."team_balance_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_balance_receipts_actor_scope_key_uidx" ON "team_tools"."team_balance_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "team_balance_receipts_expires_idx" ON "team_tools"."team_balance_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_balance_candidates_round_signature_uidx" ON "team_tools"."team_balance_draft_candidates" USING btree ("draft_id","evaluation_round","signature");--> statement-breakpoint
CREATE UNIQUE INDEX "team_balance_candidates_auto_rank_uidx" ON "team_tools"."team_balance_draft_candidates" USING btree ("draft_id","evaluation_round","rank") WHERE "team_tools"."team_balance_draft_candidates"."source" = 'AUTO';--> statement-breakpoint
CREATE INDEX "team_balance_candidates_draft_round_idx" ON "team_tools"."team_balance_draft_candidates" USING btree ("draft_id","evaluation_round");--> statement-breakpoint
CREATE UNIQUE INDEX "team_balance_participants_draft_ordinal_uidx" ON "team_tools"."team_balance_draft_participants" USING btree ("draft_id","ordinal");--> statement-breakpoint
CREATE INDEX "team_balance_drafts_owner_updated_idx" ON "team_tools"."team_balance_drafts" USING btree ("owner_user_account_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_balance_outbox_request_uidx" ON "team_tools"."team_balance_outbox" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "team_balance_outbox_pending_idx" ON "team_tools"."team_balance_outbox" USING btree ("created_at","id") WHERE "team_tools"."team_balance_outbox"."status" = 'PENDING';
--> statement-breakpoint
ALTER TABLE "competition"."match_series" ADD CONSTRAINT "match_series_team_balance_draft_id_team_balance_drafts_id_fk" FOREIGN KEY ("team_balance_draft_id") REFERENCES "team_tools"."team_balance_drafts"("id") ON DELETE restrict ON UPDATE no action;
