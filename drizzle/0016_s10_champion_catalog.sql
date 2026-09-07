CREATE TABLE "catalog"."champion_command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"body_digest_hex" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "champion_receipts_key_hash" CHECK (octet_length("catalog"."champion_command_receipts"."key_hash") = 32),
	CONSTRAINT "champion_receipts_request_hash" CHECK (octet_length("catalog"."champion_command_receipts"."request_hash") = 32),
	CONSTRAINT "champion_receipts_body_digest" CHECK ("catalog"."champion_command_receipts"."body_digest_hex" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "champion_receipts_status" CHECK ("catalog"."champion_command_receipts"."response_status" BETWEEN 200 AND 299),
	CONSTRAINT "champion_receipts_expiry" CHECK ("catalog"."champion_command_receipts"."expires_at" > "catalog"."champion_command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "catalog"."champion_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"champion_key" varchar(64) NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "champion_outbox_revision" CHECK ("catalog"."champion_outbox"."aggregate_revision" >= 0),
	CONSTRAINT "champion_outbox_payload" CHECK (jsonb_typeof("catalog"."champion_outbox"."payload_json") = 'object')
);
--> statement-breakpoint
ALTER TABLE "catalog"."champion_command_receipts" ADD CONSTRAINT "champion_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."champion_outbox" ADD CONSTRAINT "champion_outbox_champion_key_champions_key_fk" FOREIGN KEY ("champion_key") REFERENCES "catalog"."champions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "champion_receipts_actor_scope_key_uidx" ON "catalog"."champion_command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "champion_receipts_expires_idx" ON "catalog"."champion_command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "champion_outbox_request_event_uidx" ON "catalog"."champion_outbox" USING btree ("request_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "champion_outbox_dedupe_uidx" ON "catalog"."champion_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "champion_outbox_pending_idx" ON "catalog"."champion_outbox" USING btree ("created_at","id") WHERE "catalog"."champion_outbox"."delivered_at" IS NULL;