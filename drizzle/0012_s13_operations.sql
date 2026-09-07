CREATE SCHEMA IF NOT EXISTS "operations";
--> statement-breakpoint
CREATE TYPE "operations"."ai_request_status" AS ENUM ('DENIED', 'PENDING', 'SUCCEEDED', 'FAILED');
--> statement-breakpoint
CREATE TYPE "operations"."outbox_status" AS ENUM ('PENDING', 'DELIVERED');
--> statement-breakpoint
CREATE TYPE "operations"."maintenance_run_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
--> statement-breakpoint
CREATE TABLE "operations"."site_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"brand_name" varchar(80) NOT NULL,
	"tagline" varchar(160) NOT NULL,
	"support_url" varchar(500),
	"features_json" jsonb NOT NULL,
	"ai_allowed_roles_json" jsonb NOT NULL,
	"ai_requests_per_hour" integer DEFAULT 10 NOT NULL,
	"ai_daily_cost_limit_micros" bigint DEFAULT 0 NOT NULL,
	"internal_maintenance_note" varchar(2000),
	"updated_by_user_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_singleton" CHECK ("operations"."site_settings"."id" = 1),
	CONSTRAINT "site_settings_revision_nonnegative" CHECK ("operations"."site_settings"."revision" >= 0),
	CONSTRAINT "site_settings_ai_rate_range" CHECK ("operations"."site_settings"."ai_requests_per_hour" BETWEEN 1 AND 1000),
	CONSTRAINT "site_settings_ai_cost_range" CHECK ("operations"."site_settings"."ai_daily_cost_limit_micros" BETWEEN 0 AND 1000000000),
	CONSTRAINT "site_settings_features_object" CHECK (jsonb_typeof("operations"."site_settings"."features_json") = 'object'),
	CONSTRAINT "site_settings_ai_roles_array" CHECK (jsonb_typeof("operations"."site_settings"."ai_allowed_roles_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "operations"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" bytea NOT NULL,
	"request_hash" bytea NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operations_receipts_key_hash" CHECK (octet_length("operations"."command_receipts"."key_hash") = 32),
	CONSTRAINT "operations_receipts_request_hash" CHECK (octet_length("operations"."command_receipts"."request_hash") = 32),
	CONSTRAINT "operations_receipts_status_http" CHECK ("operations"."command_receipts"."response_status" BETWEEN 200 AND 599),
	CONSTRAINT "operations_receipts_expiry" CHECK ("operations"."command_receipts"."expires_at" > "operations"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "operations"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "operations"."outbox_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "operations_outbox_revision_nonnegative" CHECK ("operations"."outbox"."aggregate_revision" >= 0),
	CONSTRAINT "operations_outbox_delivery" CHECK (("operations"."outbox"."status" = 'PENDING' AND "operations"."outbox"."delivered_at" IS NULL) OR ("operations"."outbox"."status" = 'DELIVERED' AND "operations"."outbox"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "operations"."job_nonce_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_name" varchar(64) NOT NULL,
	"nonce_hash" bytea NOT NULL,
	"request_hash" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "job_nonce_bindings_nonce_hash" CHECK (octet_length("operations"."job_nonce_bindings"."nonce_hash") = 32),
	CONSTRAINT "job_nonce_bindings_request_hash" CHECK (octet_length("operations"."job_nonce_bindings"."request_hash") = 32),
	CONSTRAINT "job_nonce_bindings_expiry" CHECK ("operations"."job_nonce_bindings"."expires_at" > "operations"."job_nonce_bindings"."created_at")
);
--> statement-breakpoint
CREATE TABLE "operations"."maintenance_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_name" varchar(64) NOT NULL,
	"request_id" uuid NOT NULL,
	"status" "operations"."maintenance_run_status" NOT NULL,
	"counts_json" jsonb NOT NULL,
	"failure_code" varchar(64),
	"actor_user_account_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "maintenance_runs_lifecycle" CHECK (("operations"."maintenance_runs"."status" = 'RUNNING' AND "operations"."maintenance_runs"."completed_at" IS NULL AND "operations"."maintenance_runs"."failure_code" IS NULL) OR ("operations"."maintenance_runs"."status" = 'SUCCEEDED' AND "operations"."maintenance_runs"."completed_at" IS NOT NULL AND "operations"."maintenance_runs"."failure_code" IS NULL) OR ("operations"."maintenance_runs"."status" = 'FAILED' AND "operations"."maintenance_runs"."completed_at" IS NOT NULL AND "operations"."maintenance_runs"."failure_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "operations"."ai_request_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"actor_role" varchar(16) NOT NULL,
	"status" "operations"."ai_request_status" NOT NULL,
	"prompt_hash" bytea NOT NULL,
	"prompt_char_count" integer NOT NULL,
	"output_char_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_micros" bigint DEFAULT 0 NOT NULL,
	"adapter_key" varchar(64) NOT NULL,
	"failure_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_request_ledger_prompt_hash" CHECK (octet_length("operations"."ai_request_ledger"."prompt_hash") = 32),
	CONSTRAINT "ai_request_ledger_role" CHECK ("operations"."ai_request_ledger"."actor_role" IN ('USER', 'ADMIN', 'SUPER_ADMIN')),
	CONSTRAINT "ai_request_ledger_counts_nonnegative" CHECK ("operations"."ai_request_ledger"."prompt_char_count" >= 0 AND "operations"."ai_request_ledger"."output_char_count" >= 0 AND "operations"."ai_request_ledger"."input_tokens" >= 0 AND "operations"."ai_request_ledger"."output_tokens" >= 0 AND "operations"."ai_request_ledger"."estimated_cost_micros" >= 0),
	CONSTRAINT "ai_request_ledger_lifecycle" CHECK (("operations"."ai_request_ledger"."status" = 'PENDING' AND "operations"."ai_request_ledger"."completed_at" IS NULL AND "operations"."ai_request_ledger"."failure_code" IS NULL) OR ("operations"."ai_request_ledger"."status" = 'SUCCEEDED' AND "operations"."ai_request_ledger"."completed_at" IS NOT NULL AND "operations"."ai_request_ledger"."failure_code" IS NULL) OR ("operations"."ai_request_ledger"."status" IN ('DENIED', 'FAILED') AND "operations"."ai_request_ledger"."completed_at" IS NOT NULL AND "operations"."ai_request_ledger"."failure_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "operations"."site_settings" ADD CONSTRAINT "site_settings_updated_by_user_account_id_auth_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_auth_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations"."maintenance_runs" ADD CONSTRAINT "maintenance_runs_actor_user_account_id_auth_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "operations"."ai_request_ledger" ADD CONSTRAINT "ai_request_ledger_actor_user_account_id_auth_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_receipts_actor_scope_key_uidx" ON "operations"."command_receipts" USING btree ("actor_user_account_id", "scope", "key_hash");
--> statement-breakpoint
CREATE INDEX "operations_receipts_expires_idx" ON "operations"."command_receipts" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_outbox_request_uidx" ON "operations"."outbox" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "operations_outbox_pending_idx" ON "operations"."outbox" USING btree ("status", "created_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "job_nonce_bindings_job_nonce_uidx" ON "operations"."job_nonce_bindings" USING btree ("job_name", "nonce_hash");
--> statement-breakpoint
CREATE INDEX "job_nonce_bindings_expires_idx" ON "operations"."job_nonce_bindings" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_runs_request_uidx" ON "operations"."maintenance_runs" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "maintenance_runs_started_idx" ON "operations"."maintenance_runs" USING btree ("started_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_request_ledger_request_uidx" ON "operations"."ai_request_ledger" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "ai_request_ledger_actor_created_idx" ON "operations"."ai_request_ledger" USING btree ("actor_user_account_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_request_ledger_status_created_idx" ON "operations"."ai_request_ledger" USING btree ("status", "created_at");
--> statement-breakpoint
INSERT INTO "operations"."site_settings" (
	"id", "brand_name", "tagline", "features_json", "ai_allowed_roles_json", "ai_requests_per_hour", "ai_daily_cost_limit_micros"
) VALUES (
	1,
	'K-LOL.GG',
	'함께 기록하고 성장하는 사설 리그',
	'{"registrations":true,"matchSubmissions":true,"teamBalance":true,"kakaoHelp":true,"riotIntegration":false,"aiAssistant":false}'::jsonb,
	'["ADMIN","SUPER_ADMIN"]'::jsonb,
	10,
	0
);
