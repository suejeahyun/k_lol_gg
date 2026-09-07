CREATE TABLE "recruiting"."kakao_operation_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"global_enabled" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"player_search_enabled" boolean DEFAULT true NOT NULL,
	"season_applications_enabled" boolean DEFAULT true NOT NULL,
	"image_receive_enabled" boolean DEFAULT true NOT NULL,
	"recruiting_enabled" boolean DEFAULT true NOT NULL,
	"scheduled_notice_enabled" boolean DEFAULT true NOT NULL,
	"max_message_length" integer DEFAULT 4000 NOT NULL,
	"updated_by_user_account_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_operation_settings_singleton" CHECK ("recruiting"."kakao_operation_settings"."id" = 1),
	CONSTRAINT "kakao_operation_settings_revision_nonnegative" CHECK ("recruiting"."kakao_operation_settings"."revision" >= 0),
	CONSTRAINT "kakao_operation_settings_max_message" CHECK ("recruiting"."kakao_operation_settings"."max_message_length" BETWEEN 100 AND 10000)
);
--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" DROP CONSTRAINT "recruiting_outbox_aggregate_type";--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_operation_settings" ADD CONSTRAINT "kakao_operation_settings_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" ADD CONSTRAINT "recruiting_outbox_aggregate_type" CHECK ("recruiting"."outbox"."aggregate_type" IN ('RECRUIT_PARTY', 'SCRIM_RECRUIT', 'OPERATION_FORM', 'KAKAO_IMAGE_SESSION', 'KAKAO_SETTINGS'));--> statement-breakpoint
INSERT INTO "recruiting"."kakao_operation_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
