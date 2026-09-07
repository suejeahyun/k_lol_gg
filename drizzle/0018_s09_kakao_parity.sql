CREATE TYPE "competition"."season_kakao_pending_match_state" AS ENUM('MATCHED_RESERVE', 'UNMATCHED', 'AMBIGUOUS');--> statement-breakpoint
CREATE TYPE "competition"."season_kakao_pending_status" AS ENUM('ACTIVE', 'CANCELLED', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "competition"."season_kakao_pending_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"matched_player_id" uuid,
	"apply_date" date NOT NULL,
	"recruit_no" integer NOT NULL,
	"slot_no" integer NOT NULL,
	"supplied_name" varchar(100) NOT NULL,
	"supplied_riot_id" varchar(97),
	"main_position" "competition"."season_application_position" NOT NULL,
	"sub_positions" "competition"."season_application_position"[] DEFAULT ARRAY[]::competition.season_application_position[] NOT NULL,
	"reserve" boolean DEFAULT false NOT NULL,
	"match_state" "competition"."season_kakao_pending_match_state" NOT NULL,
	"status" "competition"."season_kakao_pending_status" DEFAULT 'ACTIVE' NOT NULL,
	"source_reference_hash" "bytea" NOT NULL,
	"cancelled_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_kakao_pending_recruit_no_positive" CHECK ("competition"."season_kakao_pending_applications"."recruit_no" > 0),
	CONSTRAINT "season_kakao_pending_slot_no_positive" CHECK ("competition"."season_kakao_pending_applications"."slot_no" > 0),
	CONSTRAINT "season_kakao_pending_name_nonempty" CHECK (char_length("competition"."season_kakao_pending_applications"."supplied_name") > 0),
	CONSTRAINT "season_kakao_pending_source_hash_32_bytes" CHECK (octet_length("competition"."season_kakao_pending_applications"."source_reference_hash") = 32),
	CONSTRAINT "season_kakao_pending_revision_nonnegative" CHECK ("competition"."season_kakao_pending_applications"."revision" >= 0),
	CONSTRAINT "season_kakao_pending_match_consistency" CHECK (("competition"."season_kakao_pending_applications"."match_state" = 'MATCHED_RESERVE' AND "competition"."season_kakao_pending_applications"."reserve" AND "competition"."season_kakao_pending_applications"."matched_player_id" IS NOT NULL)
        OR ("competition"."season_kakao_pending_applications"."match_state" IN ('UNMATCHED', 'AMBIGUOUS') AND "competition"."season_kakao_pending_applications"."matched_player_id" IS NULL)),
	CONSTRAINT "season_kakao_pending_lifecycle_consistency" CHECK (("competition"."season_kakao_pending_applications"."status" = 'ACTIVE' AND "competition"."season_kakao_pending_applications"."cancelled_at" IS NULL AND "competition"."season_kakao_pending_applications"."resolved_at" IS NULL)
        OR ("competition"."season_kakao_pending_applications"."status" = 'CANCELLED' AND "competition"."season_kakao_pending_applications"."cancelled_at" IS NOT NULL AND "competition"."season_kakao_pending_applications"."resolved_at" IS NULL)
        OR ("competition"."season_kakao_pending_applications"."status" = 'RESOLVED' AND "competition"."season_kakao_pending_applications"."cancelled_at" IS NULL AND "competition"."season_kakao_pending_applications"."resolved_at" IS NOT NULL)),
	CONSTRAINT "season_kakao_pending_sub_positions_valid" CHECK (cardinality("competition"."season_kakao_pending_applications"."sub_positions") <= 5
        AND NOT ("competition"."season_kakao_pending_applications"."main_position" = ANY("competition"."season_kakao_pending_applications"."sub_positions"))
        AND (("competition"."season_kakao_pending_applications"."main_position" = 'ALL' AND cardinality("competition"."season_kakao_pending_applications"."sub_positions") = 0)
          OR ("competition"."season_kakao_pending_applications"."main_position" <> 'ALL' AND NOT ('ALL' = ANY("competition"."season_kakao_pending_applications"."sub_positions"))))
        AND cardinality("competition"."season_kakao_pending_applications"."sub_positions") =
          (case when 'TOP' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end) +
          (case when 'JGL' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end) +
          (case when 'MID' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end) +
          (case when 'ADC' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end) +
          (case when 'SUP' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end) +
          (case when 'ALL' = ANY("competition"."season_kakao_pending_applications"."sub_positions") then 1 else 0 end))
);
--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD COLUMN "source_slot_no" integer;--> statement-breakpoint
ALTER TABLE "competition"."season_kakao_pending_applications" ADD CONSTRAINT "season_kakao_pending_applications_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition"."season_kakao_pending_applications" ADD CONSTRAINT "season_kakao_pending_applications_matched_player_id_players_id_fk" FOREIGN KEY ("matched_player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_kakao_pending_slot_uidx" ON "competition"."season_kakao_pending_applications" USING btree ("season_id","apply_date","recruit_no","slot_no");--> statement-breakpoint
CREATE INDEX "season_kakao_pending_review_idx" ON "competition"."season_kakao_pending_applications" USING btree ("season_id","apply_date","recruit_no","status","slot_no");--> statement-breakpoint
CREATE INDEX "season_kakao_pending_player_idx" ON "competition"."season_kakao_pending_applications" USING btree ("matched_player_id","status");--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_source_slot_no_positive" CHECK ("competition"."season_applications"."source_slot_no" IS NULL OR "competition"."season_applications"."source_slot_no" > 0);