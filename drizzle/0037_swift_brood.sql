CREATE TABLE "competition"."season_inhouse_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"apply_date" date NOT NULL,
	"recruit_no" integer NOT NULL,
	"source_room_id_hash" "bytea" NOT NULL,
	"mode" varchar(16) NOT NULL,
	"capacity" integer DEFAULT 10 NOT NULL,
	"start_time_text" varchar(32),
	"scheduled_start_at" timestamp with time zone,
	"notice_text" text,
	"source_reference_hash" "bytea" NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_inhouse_rounds_recruit_no_positive" CHECK ("competition"."season_inhouse_rounds"."recruit_no" > 0),
	CONSTRAINT "season_inhouse_rounds_capacity_range" CHECK ("competition"."season_inhouse_rounds"."capacity" >= 2 AND "competition"."season_inhouse_rounds"."capacity" <= 20),
	CONSTRAINT "season_inhouse_rounds_room_hash_32_bytes" CHECK (octet_length("competition"."season_inhouse_rounds"."source_room_id_hash") = 32),
	CONSTRAINT "season_inhouse_rounds_source_hash_32_bytes" CHECK (octet_length("competition"."season_inhouse_rounds"."source_reference_hash") = 32),
	CONSTRAINT "season_inhouse_rounds_mode" CHECK ("competition"."season_inhouse_rounds"."mode" IN ('RIFT', 'ARAM', 'AUGMENT_ARAM')),
	CONSTRAINT "season_inhouse_rounds_revision_nonnegative" CHECK ("competition"."season_inhouse_rounds"."revision" >= 0),
	CONSTRAINT "season_inhouse_rounds_notice_length" CHECK ("competition"."season_inhouse_rounds"."notice_text" IS NULL OR char_length("competition"."season_inhouse_rounds"."notice_text") <= 600)
);
--> statement-breakpoint
ALTER TABLE "competition"."season_applications" DROP CONSTRAINT "season_applications_source_mode";--> statement-breakpoint
ALTER TABLE "competition"."season_kakao_pending_applications" DROP CONSTRAINT "season_kakao_pending_source_mode";--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD CONSTRAINT "season_inhouse_rounds_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "competition"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_inhouse_rounds_scope_uidx" ON "competition"."season_inhouse_rounds" USING btree ("season_id","apply_date","recruit_no","source_room_id_hash","mode");--> statement-breakpoint
CREATE INDEX "season_inhouse_rounds_room_date_idx" ON "competition"."season_inhouse_rounds" USING btree ("season_id","apply_date","source_room_id_hash","recruit_no");--> statement-breakpoint
ALTER TABLE "competition"."season_applications" ADD CONSTRAINT "season_applications_source_mode" CHECK ("competition"."season_applications"."source_mode" IS NULL OR "competition"."season_applications"."source_mode" IN ('RIFT', 'ARAM', 'AUGMENT_ARAM'));--> statement-breakpoint
ALTER TABLE "competition"."season_kakao_pending_applications" ADD CONSTRAINT "season_kakao_pending_source_mode" CHECK ("competition"."season_kakao_pending_applications"."source_mode" IS NULL OR "competition"."season_kakao_pending_applications"."source_mode" IN ('RIFT', 'ARAM', 'AUGMENT_ARAM'));