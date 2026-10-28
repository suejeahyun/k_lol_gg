CREATE SCHEMA "community_sites";
--> statement-breakpoint
CREATE TABLE "community_sites"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_status" integer NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "community_site_receipts_hashes" CHECK (octet_length("community_sites"."command_receipts"."key_hash") = 32 AND octet_length("community_sites"."command_receipts"."request_hash") = 32),
	CONSTRAINT "community_site_receipts_revision" CHECK ("community_sites"."command_receipts"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "community_site_receipts_expiry" CHECK ("community_sites"."command_receipts"."expires_at" > "community_sites"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "community_sites"."provisioning_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"configuration_json" jsonb NOT NULL,
	"site_revision" bigint NOT NULL,
	"requested_by_user_account_id" uuid NOT NULL,
	"checkpoint" varchar(64) DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"resource_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" varchar(96),
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "community_site_jobs_kind" CHECK ("community_sites"."provisioning_jobs"."kind" IN ('PROVISION','PUBLISH_CONFIGURATION','ACTIVATE_SITE')),
	CONSTRAINT "community_site_jobs_status" CHECK ("community_sites"."provisioning_jobs"."status" IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
	CONSTRAINT "community_site_jobs_revision" CHECK ("community_sites"."provisioning_jobs"."site_revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "community_site_jobs_attempt" CHECK ("community_sites"."provisioning_jobs"."attempt_count" >= 0),
	CONSTRAINT "community_site_jobs_configuration" CHECK (jsonb_typeof("community_sites"."provisioning_jobs"."configuration_json") = 'object'),
	CONSTRAINT "community_site_jobs_resources" CHECK (jsonb_typeof("community_sites"."provisioning_jobs"."resource_json") = 'object'),
	CONSTRAINT "community_site_jobs_lease" CHECK (("community_sites"."provisioning_jobs"."lease_token" IS NULL) = ("community_sites"."provisioning_jobs"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "community_sites"."runtime_configuration" (
	"id" integer PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"publication_state" varchar(16) DEFAULT 'AWAITING_OWNER' NOT NULL,
	"configuration_json" jsonb NOT NULL,
	"revision" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_site_runtime_singleton" CHECK ("community_sites"."runtime_configuration"."id" = 1),
	CONSTRAINT "community_site_runtime_publication_state" CHECK ("community_sites"."runtime_configuration"."publication_state" IN ('AWAITING_OWNER', 'ACTIVE')),
	CONSTRAINT "community_site_runtime_revision" CHECK ("community_sites"."runtime_configuration"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "community_site_runtime_configuration" CHECK (jsonb_typeof("community_sites"."runtime_configuration"."configuration_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "community_sites"."sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"configuration_json" jsonb NOT NULL,
	"published_configuration_json" jsonb,
	"status" varchar(24) NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"review_reason" varchar(1000),
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"origin" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_sites_slug" CHECK ("community_sites"."sites"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "community_sites_status" CHECK ("community_sites"."sites"."status" IN ('SUBMITTED','CHANGES_REQUESTED','REJECTED','CANCELLED','APPROVED','PROVISIONING','AWAITING_OWNER','ACTIVATING','ACTIVE','FAILED')),
	CONSTRAINT "community_sites_revision" CHECK ("community_sites"."sites"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "community_sites_configuration" CHECK (jsonb_typeof("community_sites"."sites"."configuration_json") = 'object' AND "community_sites"."sites"."configuration_json"->>'slug' = "community_sites"."sites"."slug"),
	CONSTRAINT "community_sites_published_configuration" CHECK ("community_sites"."sites"."published_configuration_json" IS NULL OR jsonb_typeof("community_sites"."sites"."published_configuration_json") = 'object'),
	CONSTRAINT "community_sites_origin" CHECK ("community_sites"."sites"."origin" IS NULL OR "community_sites"."sites"."origin" LIKE 'https://%'),
	CONSTRAINT "community_sites_ready" CHECK ("community_sites"."sites"."status" NOT IN ('AWAITING_OWNER','ACTIVATING','ACTIVE') OR ("community_sites"."sites"."origin" IS NOT NULL AND "community_sites"."sites"."published_configuration_json" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "auth"."community_sso_clients" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" "bytea" NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_sso_client_digest" CHECK (octet_length("auth"."community_sso_clients"."secret_hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "auth"."community_sso_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"site_id" uuid NOT NULL,
	"user_account_id" uuid NOT NULL,
	"auth_version" integer NOT NULL,
	"purpose" "auth"."session_purpose" NOT NULL,
	"callback_url" varchar(500) NOT NULL,
	"code_challenge" varchar(43) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "community_sso_code_digest" CHECK (octet_length("auth"."community_sso_codes"."code_hash") = 32),
	CONSTRAINT "community_sso_code_version" CHECK ("auth"."community_sso_codes"."auth_version" >= 0),
	CONSTRAINT "community_sso_code_expiry" CHECK ("auth"."community_sso_codes"."expires_at" > "auth"."community_sso_codes"."created_at"),
	CONSTRAINT "community_sso_code_challenge" CHECK ("auth"."community_sso_codes"."code_challenge" ~ '^[A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
CREATE TABLE "auth"."community_sso_identities" (
	"hub_issuer" varchar(300) NOT NULL,
	"hub_subject" uuid NOT NULL,
	"user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_sso_identity_pk" PRIMARY KEY("hub_issuer","hub_subject"),
	CONSTRAINT "community_sso_identity_issuer" CHECK ("auth"."community_sso_identities"."hub_issuer" LIKE 'https://%' OR "auth"."community_sso_identities"."hub_issuer" LIKE 'http://localhost:%' OR "auth"."community_sso_identities"."hub_issuer" LIKE 'http://127.0.0.1:%')
);
--> statement-breakpoint
ALTER TABLE "community_sites"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."command_receipts" ADD CONSTRAINT "command_receipts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "community_sites"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "community_sites"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_requested_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("requested_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."runtime_configuration" ADD CONSTRAINT "runtime_configuration_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."sites" ADD CONSTRAINT "sites_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sites"."sites" ADD CONSTRAINT "sites_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."community_sso_clients" ADD CONSTRAINT "community_sso_clients_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "community_sites"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."community_sso_codes" ADD CONSTRAINT "community_sso_codes_site_id_community_sso_clients_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "auth"."community_sso_clients"("site_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."community_sso_codes" ADD CONSTRAINT "community_sso_codes_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."community_sso_identities" ADD CONSTRAINT "community_sso_identities_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_site_receipts_actor_key_uidx" ON "community_sites"."command_receipts" USING btree ("actor_user_account_id","key_hash");--> statement-breakpoint
CREATE INDEX "community_site_receipts_expiry_idx" ON "community_sites"."command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_site_jobs_active_uidx" ON "community_sites"."provisioning_jobs" USING btree ("site_id") WHERE "community_sites"."provisioning_jobs"."status" IN ('PENDING','RUNNING');--> statement-breakpoint
CREATE INDEX "community_site_jobs_dispatch_idx" ON "community_sites"."provisioning_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "community_site_jobs_site_created_idx" ON "community_sites"."provisioning_jobs" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_sites_slug_uidx" ON "community_sites"."sites" USING btree ("slug") WHERE "community_sites"."sites"."status" NOT IN ('REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE UNIQUE INDEX "community_sites_origin_uidx" ON "community_sites"."sites" USING btree ("origin");--> statement-breakpoint
CREATE INDEX "community_sites_owner_updated_idx" ON "community_sites"."sites" USING btree ("owner_user_account_id","updated_at");--> statement-breakpoint
CREATE INDEX "community_sites_status_created_idx" ON "community_sites"."sites" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_sso_code_digest_uidx" ON "auth"."community_sso_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "community_sso_code_expiry_idx" ON "auth"."community_sso_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_sso_identity_account_uidx" ON "auth"."community_sso_identities" USING btree ("user_account_id");
--> statement-breakpoint
-- Upgrade only the original HUB bootstrap placeholder. Preserve all configured child settings.
UPDATE "operations"."site_settings"
SET "features_json" = '{"registrations":true,"matchSubmissions":false,"teamBalance":false,"kakaoHelp":false,"riotIntegration":false,"aiAssistant":false}'::jsonb,
    "revision" = "revision" + 1,
    "updated_at" = now()
WHERE "brand_name" = 'GG HUB' AND "features_json" = '{}'::jsonb;
