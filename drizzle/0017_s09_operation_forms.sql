CREATE TYPE "recruiting"."operation_form_status" AS ENUM('PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "recruiting"."operation_form_type" AS ENUM('friends', 'leaves', 'meetups', 'suggestions');--> statement-breakpoint
CREATE TABLE "recruiting"."operation_forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"form_type" "recruiting"."operation_form_type" NOT NULL,
	"status" "recruiting"."operation_form_status" DEFAULT 'PENDING' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"source_room_id" varchar(128) NOT NULL,
	"source_sender_id" varchar(128) NOT NULL,
	"admin_note" varchar(2000),
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_account_id" uuid,
	"deletion_reason" varchar(500),
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_forms_revision_nonnegative" CHECK ("recruiting"."operation_forms"."revision" >= 0),
	CONSTRAINT "operation_forms_payload_object" CHECK (jsonb_typeof("recruiting"."operation_forms"."payload_json") = 'object' AND pg_column_size("recruiting"."operation_forms"."payload_json") <= 16384),
	CONSTRAINT "operation_forms_source_room_nonempty" CHECK (char_length(btrim("recruiting"."operation_forms"."source_room_id")) BETWEEN 1 AND 128),
	CONSTRAINT "operation_forms_source_sender_nonempty" CHECK (char_length(btrim("recruiting"."operation_forms"."source_sender_id")) BETWEEN 1 AND 128),
	CONSTRAINT "operation_forms_review_consistency" CHECK (("recruiting"."operation_forms"."reviewed_at" IS NULL AND "recruiting"."operation_forms"."reviewed_by_user_account_id" IS NULL) OR ("recruiting"."operation_forms"."reviewed_at" IS NOT NULL AND "recruiting"."operation_forms"."reviewed_by_user_account_id" IS NOT NULL)),
	CONSTRAINT "operation_forms_delete_consistency" CHECK (("recruiting"."operation_forms"."deleted_at" IS NULL AND "recruiting"."operation_forms"."deleted_by_user_account_id" IS NULL AND "recruiting"."operation_forms"."deletion_reason" IS NULL) OR ("recruiting"."operation_forms"."deleted_at" IS NOT NULL AND "recruiting"."operation_forms"."deleted_by_user_account_id" IS NOT NULL AND char_length(btrim("recruiting"."operation_forms"."deletion_reason")) BETWEEN 1 AND 500))
);
--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" DROP CONSTRAINT "recruiting_outbox_aggregate_type";--> statement-breakpoint
ALTER TABLE "recruiting"."operation_forms" ADD CONSTRAINT "operation_forms_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."operation_forms" ADD CONSTRAINT "operation_forms_deleted_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("deleted_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operation_forms_active_type_status_idx" ON "recruiting"."operation_forms" USING btree ("form_type","status","submitted_at" DESC NULLS LAST) WHERE "recruiting"."operation_forms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "operation_forms_active_submitted_idx" ON "recruiting"."operation_forms" USING btree ("submitted_at" DESC NULLS LAST,"id") WHERE "recruiting"."operation_forms"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."outbox" ADD CONSTRAINT "recruiting_outbox_aggregate_type" CHECK ("recruiting"."outbox"."aggregate_type" IN ('RECRUIT_PARTY', 'SCRIM_RECRUIT', 'OPERATION_FORM'));