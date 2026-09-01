CREATE SCHEMA "competition";
--> statement-breakpoint
CREATE TYPE "competition"."season_application_position" AS ENUM('TOP', 'JGL', 'MID', 'ADC', 'SUP', 'ALL');--> statement-breakpoint
CREATE TYPE "competition"."season_application_source" AS ENUM('SITE', 'KAKAO');--> statement-breakpoint
CREATE TYPE "competition"."season_application_status" AS ENUM('APPLIED', 'RESERVE', 'CONFIRMED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "competition"."season_status" AS ENUM('DRAFT', 'ACTIVE', 'ENDED', 'RETIRED');--> statement-breakpoint
CREATE TABLE "competition"."season_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" bigint,
	"season_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"apply_date" date NOT NULL,
	"recruit_no" integer DEFAULT 1 NOT NULL,
	"main_position" "competition"."season_application_position" NOT NULL,
	"sub_positions" "competition"."season_application_position"[] DEFAULT ARRAY[]::competition.season_application_position[] NOT NULL,
	"status" "competition"."season_application_status" DEFAULT 'APPLIED' NOT NULL,
	"source" "competition"."season_application_source" DEFAULT 'SITE' NOT NULL,
	"source_reference_hash" "bytea",
	"review_note" text,
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_applications_legacy_id_positive" CHECK ("competition"."season_applications"."legacy_id" IS NULL OR "competition"."season_applications"."legacy_id" > 0),
	CONSTRAINT "season_applications_recruit_no_positive" CHECK ("competition"."season_applications"."recruit_no" > 0),
	CONSTRAINT "season_applications_revision_nonnegative" CHECK ("competition"."season_applications"."revision" >= 0),
	CONSTRAINT "season_applications_source_hash_32_bytes" CHECK ("competition"."season_applications"."source_reference_hash" IS NULL OR octet_length("competition"."season_applications"."source_reference_hash") = 32),
	CONSTRAINT "season_applications_source_hash_consistency" CHECK ((
        ("competition"."season_applications"."source" = 'SITE' AND "competition"."season_applications"."source_reference_hash" IS NULL)
        OR ("competition"."season_applications"."source" = 'KAKAO' AND "competition"."season_applications"."source_reference_hash" IS NOT NULL)
      )),
	CONSTRAINT "season_applications_sub_positions_valid" CHECK ((
        cardinality("competition"."season_applications"."sub_positions") <= 5
        AND NOT ("competition"."season_applications"."main_position" = ANY("competition"."season_applications"."sub_positions"))
        AND (
          ("competition"."season_applications"."main_position" = 'ALL' AND cardinality("competition"."season_applications"."sub_positions") = 0)
          OR ("competition"."season_applications"."main_position" <> 'ALL' AND NOT ('ALL' = ANY("competition"."season_applications"."sub_positions")))
        )
        AND cardinality("competition"."season_applications"."sub_positions") =
          (case when 'TOP' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end) +
          (case when 'JGL' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end) +
          (case when 'MID' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end) +
          (case when 'ADC' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end) +
          (case when 'SUP' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end) +
          (case when 'ALL' = ANY("competition"."season_applications"."sub_positions") then 1 else 0 end)
      )),
	CONSTRAINT "season_applications_review_consistency" CHECK ((
        ("competition"."season_applications"."status" IN ('REJECTED', 'RESERVE', 'CONFIRMED') AND "competition"."season_applications"."reviewed_at" IS NOT NULL AND "competition"."season_applications"."reviewed_by_user_account_id" IS NOT NULL)
        OR (
          "competition"."season_applications"."status" IN ('APPLIED', 'CANCELLED')
          AND "competition"."season_applications"."review_note" IS NULL
          AND "competition"."season_applications"."reviewed_at" IS NULL
          AND "competition"."season_applications"."reviewed_by_user_account_id" IS NULL
        )
      )),
	CONSTRAINT "season_applications_cancel_consistency" CHECK ((
        ("competition"."season_applications"."status" = 'CANCELLED' AND "competition"."season_applications"."cancelled_at" IS NOT NULL)
        OR ("competition"."season_applications"."status" <> 'CANCELLED' AND "competition"."season_applications"."cancelled_at" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "competition"."season_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "season_command_receipts_key_hash_32_bytes" CHECK (octet_length("competition"."season_command_receipts"."key_hash") = 32),
	CONSTRAINT "season_command_receipts_request_hash_32_bytes" CHECK (octet_length("competition"."season_command_receipts"."request_hash") = 32),
	CONSTRAINT "season_command_receipts_status_range" CHECK ("competition"."season_command_receipts"."response_status" >= 200 AND "competition"."season_command_receipts"."response_status" < 300),
	CONSTRAINT "season_command_receipts_expiry_after_creation" CHECK ("competition"."season_command_receipts"."expires_at" > "competition"."season_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "competition"."seasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" bigint,
	"name" varchar(120) NOT NULL,
	"name_normalized" varchar(120) NOT NULL,
	"status" "competition"."season_status" DEFAULT 'DRAFT' NOT NULL,
	"applications_open_at" timestamp with time zone,
	"applications_close_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"cloned_from_season_id" uuid,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_by_user_account_id" uuid,
	"updated_by_user_account_id" uuid,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_legacy_id_positive" CHECK ("competition"."seasons"."legacy_id" IS NULL OR "competition"."seasons"."legacy_id" > 0),
	CONSTRAINT "seasons_name_normalized_nonempty" CHECK (char_length("competition"."seasons"."name_normalized") > 0),
	CONSTRAINT "seasons_revision_nonnegative" CHECK ("competition"."seasons"."revision" >= 0),
	CONSTRAINT "seasons_application_window_order" CHECK ("competition"."seasons"."applications_close_at" IS NULL OR "competition"."seasons"."applications_open_at" IS NULL OR "competition"."seasons"."applications_close_at" > "competition"."seasons"."applications_open_at"),
	CONSTRAINT "seasons_schedule_order" CHECK ("competition"."seasons"."ends_at" IS NULL OR "competition"."seasons"."starts_at" IS NULL OR "competition"."seasons"."ends_at" > "competition"."seasons"."starts_at"),
	CONSTRAINT "seasons_lifecycle_timestamps" CHECK ((
        ("competition"."seasons"."status" = 'DRAFT' AND "competition"."seasons"."activated_at" IS NULL AND "competition"."seasons"."ended_at" IS NULL AND "competition"."seasons"."retired_at" IS NULL)
        OR ("competition"."seasons"."status" = 'ACTIVE' AND "competition"."seasons"."activated_at" IS NOT NULL AND "competition"."seasons"."ended_at" IS NULL AND "competition"."seasons"."retired_at" IS NULL)
        OR ("competition"."seasons"."status" = 'ENDED' AND "competition"."seasons"."activated_at" IS NOT NULL AND "competition"."seasons"."ended_at" IS NOT NULL AND "competition"."seasons"."retired_at" IS NULL)
        OR ("competition"."seasons"."status" = 'RETIRED' AND "competition"."seasons"."activated_at" IS NULL AND "competition"."seasons"."ended_at" IS NULL AND "competition"."seasons"."retired_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."season_command_receipts" ADD CONSTRAINT "season_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."seasons" ADD CONSTRAINT "seasons_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."seasons" ADD CONSTRAINT "seasons_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."seasons" ADD CONSTRAINT "seasons_cloned_from_season_id_fk" FOREIGN KEY ("cloned_from_season_id") REFERENCES "competition"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_applications_legacy_id_uidx" ON "competition"."season_applications" USING btree ("legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_applications_identity_slot_uidx" ON "competition"."season_applications" USING btree ("season_id","player_id","apply_date","recruit_no");--> statement-breakpoint
CREATE INDEX "season_applications_source_reference_hash_idx" ON "competition"."season_applications" USING btree ("source_reference_hash");--> statement-breakpoint
CREATE INDEX "season_applications_review_queue_idx" ON "competition"."season_applications" USING btree ("season_id","apply_date","recruit_no","status","created_at");--> statement-breakpoint
CREATE INDEX "season_applications_player_created_at_idx" ON "competition"."season_applications" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "season_command_receipts_actor_scope_key_uidx" ON "competition"."season_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "season_command_receipts_created_at_idx" ON "competition"."season_command_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "season_command_receipts_expires_at_idx" ON "competition"."season_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_legacy_id_uidx" ON "competition"."seasons" USING btree ("legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_name_normalized_uidx" ON "competition"."seasons" USING btree ("name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_single_active_uidx" ON "competition"."seasons" USING btree ((1)) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "seasons_status_created_at_idx" ON "competition"."seasons" USING btree ("status","created_at");