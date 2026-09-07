CREATE TYPE "recruiting"."kakao_image_session_status" AS ENUM('ACTIVE', 'COMPLETE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "recruiting"."kakao_image_target_type" AS ENUM('MATCH_SUBMISSION', 'DISCIPLINE_TASK');--> statement-breakpoint
CREATE TYPE "recruiting"."kakao_inbound_image_status" AS ENUM('STAGED', 'READY', 'DELETE_PENDING');--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_image_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by_user_account_id" uuid NOT NULL,
	"target_type" "recruiting"."kakao_image_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"room_id_hash" "bytea" NOT NULL,
	"sender_id_hash" "bytea" NOT NULL,
	"expected_image_count" integer NOT NULL,
	"received_image_count" integer DEFAULT 0 NOT NULL,
	"status" "recruiting"."kakao_image_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_image_sessions_room_hash" CHECK (octet_length("recruiting"."kakao_image_sessions"."room_id_hash") = 32),
	CONSTRAINT "kakao_image_sessions_sender_hash" CHECK (octet_length("recruiting"."kakao_image_sessions"."sender_id_hash") = 32),
	CONSTRAINT "kakao_image_sessions_expected_count" CHECK ("recruiting"."kakao_image_sessions"."expected_image_count" BETWEEN 1 AND 100),
	CONSTRAINT "kakao_image_sessions_received_count" CHECK ("recruiting"."kakao_image_sessions"."received_image_count" BETWEEN 0 AND "recruiting"."kakao_image_sessions"."expected_image_count"),
	CONSTRAINT "kakao_image_sessions_lifecycle" CHECK (("recruiting"."kakao_image_sessions"."status" = 'ACTIVE' AND "recruiting"."kakao_image_sessions"."completed_at" IS NULL AND "recruiting"."kakao_image_sessions"."cancelled_at" IS NULL)
    OR ("recruiting"."kakao_image_sessions"."status" = 'COMPLETE' AND "recruiting"."kakao_image_sessions"."completed_at" IS NOT NULL AND "recruiting"."kakao_image_sessions"."cancelled_at" IS NULL AND "recruiting"."kakao_image_sessions"."received_image_count" = "recruiting"."kakao_image_sessions"."expected_image_count")
    OR ("recruiting"."kakao_image_sessions"."status" IN ('CANCELLED', 'EXPIRED') AND "recruiting"."kakao_image_sessions"."completed_at" IS NULL AND "recruiting"."kakao_image_sessions"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_inbound_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"private_asset_id" uuid NOT NULL,
	"image_number" integer NOT NULL,
	"request_digest" "bytea" NOT NULL,
	"sha256" "bytea" NOT NULL,
	"status" "recruiting"."kakao_inbound_image_status" DEFAULT 'STAGED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"delete_requested_at" timestamp with time zone,
	CONSTRAINT "kakao_inbound_images_number" CHECK ("recruiting"."kakao_inbound_images"."image_number" BETWEEN 1 AND 100),
	CONSTRAINT "kakao_inbound_images_request_digest" CHECK (octet_length("recruiting"."kakao_inbound_images"."request_digest") = 32),
	CONSTRAINT "kakao_inbound_images_sha" CHECK (octet_length("recruiting"."kakao_inbound_images"."sha256") = 32),
	CONSTRAINT "kakao_inbound_images_lifecycle" CHECK (("recruiting"."kakao_inbound_images"."status" = 'STAGED' AND "recruiting"."kakao_inbound_images"."ready_at" IS NULL AND "recruiting"."kakao_inbound_images"."delete_requested_at" IS NULL)
    OR ("recruiting"."kakao_inbound_images"."status" = 'READY' AND "recruiting"."kakao_inbound_images"."ready_at" IS NOT NULL AND "recruiting"."kakao_inbound_images"."delete_requested_at" IS NULL)
    OR ("recruiting"."kakao_inbound_images"."status" = 'DELETE_PENDING' AND "recruiting"."kakao_inbound_images"."delete_requested_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" DROP CONSTRAINT "recruiting_outbox_aggregate_type";--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_image_sessions" ADD CONSTRAINT "kakao_image_sessions_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_inbound_images" ADD CONSTRAINT "kakao_inbound_images_session_id_kakao_image_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "recruiting"."kakao_image_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_inbound_images" ADD CONSTRAINT "kakao_inbound_images_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_image_sessions_active_sender_uidx" ON "recruiting"."kakao_image_sessions" USING btree ("room_id_hash","sender_id_hash") WHERE "recruiting"."kakao_image_sessions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_image_sessions_active_target_uidx" ON "recruiting"."kakao_image_sessions" USING btree ("target_type","target_id") WHERE "recruiting"."kakao_image_sessions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "kakao_image_sessions_target_idx" ON "recruiting"."kakao_image_sessions" USING btree ("target_type","target_id","status");--> statement-breakpoint
CREATE INDEX "kakao_image_sessions_expiry_idx" ON "recruiting"."kakao_image_sessions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_inbound_images_asset_uidx" ON "recruiting"."kakao_inbound_images" USING btree ("private_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_inbound_images_session_number_uidx" ON "recruiting"."kakao_inbound_images" USING btree ("session_id","image_number");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_inbound_images_session_sha_uidx" ON "recruiting"."kakao_inbound_images" USING btree ("session_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_inbound_images_request_digest_uidx" ON "recruiting"."kakao_inbound_images" USING btree ("request_digest");--> statement-breakpoint
CREATE INDEX "kakao_inbound_images_session_status_idx" ON "recruiting"."kakao_inbound_images" USING btree ("session_id","status");--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" ADD CONSTRAINT "recruiting_outbox_aggregate_type" CHECK ("recruiting"."outbox"."aggregate_type" IN ('RECRUIT_PARTY', 'SCRIM_RECRUIT', 'OPERATION_FORM', 'KAKAO_IMAGE_SESSION'));