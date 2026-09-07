CREATE SCHEMA "discipline";
--> statement-breakpoint
CREATE TYPE "discipline"."ban_review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "discipline"."discipline_category" AS ENUM('GENERAL', 'INHOUSE');--> statement-breakpoint
CREATE TYPE "discipline"."outbox_status" AS ENUM('PENDING', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "discipline"."task_status" AS ENUM('REQUIRED', 'AWAITING_UPLOAD', 'PENDING_REVIEW', 'REJECTED', 'APPROVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "discipline"."discipline_type" AS ENUM('CAUTION', 'WARNING', 'BAN');--> statement-breakpoint
CREATE TABLE "discipline"."asset_bindings" (
	"private_asset_id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"owner_user_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discipline"."asset_cleanup_outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"private_asset_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"succeeded" boolean NOT NULL,
	"failure_code" varchar(64),
	CONSTRAINT "discipline_asset_cleanup_consistency" CHECK (("discipline"."asset_cleanup_outcomes"."succeeded" = true AND "discipline"."asset_cleanup_outcomes"."failure_code" IS NULL) OR ("discipline"."asset_cleanup_outcomes"."succeeded" = false AND "discipline"."asset_cleanup_outcomes"."failure_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "discipline"."ban_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_key" varchar(255) NOT NULL,
	"warning_record_ids_json" jsonb NOT NULL,
	"status" "discipline"."ban_review_status" DEFAULT 'PENDING' NOT NULL,
	"review_note" varchar(1000),
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_ban_reviews_revision_nonnegative" CHECK ("discipline"."ban_reviews"."revision" >= 0),
	CONSTRAINT "discipline_ban_reviews_warning_array" CHECK (jsonb_typeof("discipline"."ban_reviews"."warning_record_ids_json") = 'array' AND jsonb_array_length("discipline"."ban_reviews"."warning_record_ids_json") >= 3)
);
--> statement-breakpoint
CREATE TABLE "discipline"."caution_conversions" (
	"caution_record_id" uuid NOT NULL,
	"warning_record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "caution_conversions_caution_record_id_warning_record_id_pk" PRIMARY KEY("caution_record_id","warning_record_id")
);
--> statement-breakpoint
CREATE TABLE "discipline"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" varchar(255) NOT NULL,
	"actor_user_account_id" uuid,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"body_digest_hex" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discipline_receipts_key_hash" CHECK (octet_length("discipline"."command_receipts"."key_hash") = 32),
	CONSTRAINT "discipline_receipts_request_hash" CHECK (octet_length("discipline"."command_receipts"."request_hash") = 32),
	CONSTRAINT "discipline_receipts_body_digest" CHECK ("discipline"."command_receipts"."body_digest_hex" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "discipline_receipts_success" CHECK ("discipline"."command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "discipline_receipts_expiry" CHECK ("discipline"."command_receipts"."expires_at" > "discipline"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "discipline"."evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"private_asset_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "discipline_evidence_superseded_after_submit" CHECK ("discipline"."evidence"."superseded_at" IS NULL OR "discipline"."evidence"."superseded_at" >= "discipline"."evidence"."submitted_at")
);
--> statement-breakpoint
CREATE TABLE "discipline"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "discipline"."outbox_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "discipline_outbox_revision_nonnegative" CHECK ("discipline"."outbox"."aggregate_revision" >= 0),
	CONSTRAINT "discipline_outbox_payload_object" CHECK (jsonb_typeof("discipline"."outbox"."payload_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "discipline"."records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"identity_key" varchar(255) NOT NULL,
	"user_account_id" uuid,
	"player_id" uuid,
	"target_name" varchar(100) NOT NULL,
	"target_nickname" varchar(64),
	"target_tag_line" varchar(32),
	"type" "discipline"."discipline_type" NOT NULL,
	"category" "discipline"."discipline_category" DEFAULT 'GENERAL' NOT NULL,
	"source" varchar(64) NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"internal_note" varchar(2000),
	"active" boolean DEFAULT true NOT NULL,
	"reset_reason" varchar(1000),
	"reset_by_user_account_id" uuid,
	"reset_at" timestamp with time zone,
	"created_by_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_records_revision_nonnegative" CHECK ("discipline"."records"."revision" >= 0),
	CONSTRAINT "discipline_records_reason_nonempty" CHECK (char_length(btrim("discipline"."records"."reason")) BETWEEN 1 AND 1000),
	CONSTRAINT "discipline_records_identity_present" CHECK ("discipline"."records"."user_account_id" IS NOT NULL OR "discipline"."records"."player_id" IS NOT NULL OR char_length(btrim("discipline"."records"."target_name")) > 0),
	CONSTRAINT "discipline_records_reset_consistency" CHECK (("discipline"."records"."active" = true AND "discipline"."records"."reset_at" IS NULL AND "discipline"."records"."reset_reason" IS NULL) OR ("discipline"."records"."active" = false AND "discipline"."records"."reset_at" IS NOT NULL AND char_length(btrim("discipline"."records"."reset_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "discipline"."resolution_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_code" varchar(64) NOT NULL,
	"discipline_record_id" uuid NOT NULL,
	"owner_user_account_id" uuid,
	"owner_player_id" uuid,
	"category" "discipline"."discipline_category" NOT NULL,
	"required_game_count" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "discipline"."task_status" DEFAULT 'REQUIRED' NOT NULL,
	"review_note" varchar(1000),
	"review_boundary_at" timestamp with time zone,
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discipline_tasks_revision_nonnegative" CHECK ("discipline"."resolution_tasks"."revision" >= 0),
	CONSTRAINT "discipline_tasks_required_count" CHECK ("discipline"."resolution_tasks"."required_game_count" BETWEEN 1 AND 100),
	CONSTRAINT "discipline_tasks_owner_present" CHECK ("discipline"."resolution_tasks"."owner_user_account_id" IS NOT NULL OR "discipline"."resolution_tasks"."owner_player_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "discipline"."asset_bindings" ADD CONSTRAINT "asset_bindings_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."asset_bindings" ADD CONSTRAINT "asset_bindings_task_id_resolution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "discipline"."resolution_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."asset_bindings" ADD CONSTRAINT "asset_bindings_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."asset_cleanup_outcomes" ADD CONSTRAINT "asset_cleanup_outcomes_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."ban_reviews" ADD CONSTRAINT "ban_reviews_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."caution_conversions" ADD CONSTRAINT "caution_conversions_caution_record_id_records_id_fk" FOREIGN KEY ("caution_record_id") REFERENCES "discipline"."records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."caution_conversions" ADD CONSTRAINT "caution_conversions_warning_record_id_records_id_fk" FOREIGN KEY ("warning_record_id") REFERENCES "discipline"."records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."evidence" ADD CONSTRAINT "evidence_task_id_resolution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "discipline"."resolution_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."evidence" ADD CONSTRAINT "evidence_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."records" ADD CONSTRAINT "records_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."records" ADD CONSTRAINT "records_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."records" ADD CONSTRAINT "records_reset_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reset_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."records" ADD CONSTRAINT "records_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."resolution_tasks" ADD CONSTRAINT "resolution_tasks_discipline_record_id_records_id_fk" FOREIGN KEY ("discipline_record_id") REFERENCES "discipline"."records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."resolution_tasks" ADD CONSTRAINT "resolution_tasks_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."resolution_tasks" ADD CONSTRAINT "resolution_tasks_owner_player_id_players_id_fk" FOREIGN KEY ("owner_player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discipline"."resolution_tasks" ADD CONSTRAINT "resolution_tasks_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discipline_asset_bindings_task_idx" ON "discipline"."asset_bindings" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "discipline_asset_cleanup_asset_idx" ON "discipline"."asset_cleanup_outcomes" USING btree ("private_asset_id","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_ban_reviews_pending_identity_uidx" ON "discipline"."ban_reviews" USING btree ("identity_key") WHERE "discipline"."ban_reviews"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_conversion_caution_uidx" ON "discipline"."caution_conversions" USING btree ("caution_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_receipts_principal_scope_key_uidx" ON "discipline"."command_receipts" USING btree ("principal_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "discipline_receipts_expires_idx" ON "discipline"."command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_evidence_asset_uidx" ON "discipline"."evidence" USING btree ("private_asset_id");--> statement-breakpoint
CREATE INDEX "discipline_evidence_task_submitted_idx" ON "discipline"."evidence" USING btree ("task_id","submitted_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_outbox_dedupe_uidx" ON "discipline"."outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "discipline_outbox_pending_idx" ON "discipline"."outbox" USING btree ("created_at","id") WHERE "discipline"."outbox"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "discipline_records_identity_active_idx" ON "discipline"."records" USING btree ("identity_key","active","created_at");--> statement-breakpoint
CREATE INDEX "discipline_records_type_active_idx" ON "discipline"."records" USING btree ("type","active","created_at");--> statement-breakpoint
CREATE INDEX "discipline_records_account_idx" ON "discipline"."records" USING btree ("user_account_id","created_at");--> statement-breakpoint
CREATE INDEX "discipline_records_player_idx" ON "discipline"."records" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_tasks_public_code_uidx" ON "discipline"."resolution_tasks" USING btree ("public_code");--> statement-breakpoint
CREATE UNIQUE INDEX "discipline_tasks_record_uidx" ON "discipline"."resolution_tasks" USING btree ("discipline_record_id");--> statement-breakpoint
CREATE INDEX "discipline_tasks_owner_status_idx" ON "discipline"."resolution_tasks" USING btree ("owner_user_account_id","status","due_at");--> statement-breakpoint
CREATE INDEX "discipline_tasks_status_updated_idx" ON "discipline"."resolution_tasks" USING btree ("status","updated_at");