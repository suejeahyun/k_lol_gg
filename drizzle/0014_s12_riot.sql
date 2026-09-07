CREATE SCHEMA "riot";
--> statement-breakpoint
CREATE TYPE "riot"."link_method" AS ENUM('DIRECT_OWNER', 'RSO_VERIFIED', 'ADMIN');--> statement-breakpoint
CREATE TYPE "riot"."link_status" AS ENUM('CONNECTED', 'DISCONNECTED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "riot"."outbox_status" AS ENUM('PENDING', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "riot"."sync_requester" AS ENUM('OWNER', 'ADMIN', 'SUPER_ADMIN', 'JOB');--> statement-breakpoint
CREATE TYPE "riot"."sync_status" AS ENUM('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "riot"."account_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"player_id" uuid NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"game_name" varchar(16) NOT NULL,
	"tag_line" varchar(5) NOT NULL,
	"normalized_key" varchar(24) NOT NULL,
	"protected_puuid" text,
	"method" "riot"."link_method" NOT NULL,
	"status" "riot"."link_status" DEFAULT 'CONNECTED' NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riot_links_revision_nonnegative" CHECK ("riot"."account_links"."revision" >= 0),
	CONSTRAINT "riot_links_normalized_nonempty" CHECK (char_length(btrim("riot"."account_links"."normalized_key")) BETWEEN 3 AND 24),
	CONSTRAINT "riot_links_status_payload" CHECK ((
    ("riot"."account_links"."status" = 'CONNECTED' AND "riot"."account_links"."protected_puuid" IS NOT NULL AND "riot"."account_links"."disconnected_at" IS NULL)
    OR ("riot"."account_links"."status" <> 'CONNECTED' AND "riot"."account_links"."protected_puuid" IS NULL AND "riot"."account_links"."disconnected_at" IS NOT NULL)
  ))
);
--> statement-breakpoint
CREATE TABLE "riot"."command_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"body_digest_hex" varchar(64) NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "riot_receipts_key_hash" CHECK (octet_length("riot"."command_receipts"."key_hash") = 32),
	CONSTRAINT "riot_receipts_request_hash" CHECK (octet_length("riot"."command_receipts"."request_hash") = 32),
	CONSTRAINT "riot_receipts_body_digest" CHECK ("riot"."command_receipts"."body_digest_hex" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "riot_receipts_expiry" CHECK ("riot"."command_receipts"."expires_at" > "riot"."command_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "riot"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_revision" bigint NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"dedupe_key" varchar(256) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "riot"."outbox_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "riot_outbox_revision_nonnegative" CHECK ("riot"."outbox"."aggregate_revision" >= 0),
	CONSTRAINT "riot_outbox_payload_object" CHECK (jsonb_typeof("riot"."outbox"."payload_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "riot"."rso_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_account_id" uuid NOT NULL,
	"state_digest" "bytea" NOT NULL,
	"return_to" varchar(500) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"exchange_id" uuid,
	"exchange_started_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riot_rso_digest_length" CHECK (octet_length("riot"."rso_states"."state_digest") = 32),
	CONSTRAINT "riot_rso_expiry" CHECK ("riot"."rso_states"."expires_at" > "riot"."rso_states"."created_at"),
	CONSTRAINT "riot_rso_exchange_pair" CHECK (("riot"."rso_states"."exchange_id" IS NULL) = ("riot"."rso_states"."exchange_started_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "riot"."summaries" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"link_id" uuid NOT NULL,
	"game_name" varchar(16) NOT NULL,
	"tag_line" varchar(5) NOT NULL,
	"solo_tier" varchar(16),
	"solo_rank" varchar(8),
	"league_points" integer,
	"wins" integer,
	"losses" integer,
	"last_synced_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riot_summaries_counts_nonnegative" CHECK (("riot"."summaries"."league_points" IS NULL OR "riot"."summaries"."league_points" >= 0) AND ("riot"."summaries"."wins" IS NULL OR "riot"."summaries"."wins" >= 0) AND ("riot"."summaries"."losses" IS NULL OR "riot"."summaries"."losses" >= 0))
);
--> statement-breakpoint
CREATE TABLE "riot"."sync_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"link_id" uuid NOT NULL,
	"requested_by" "riot"."sync_requester" NOT NULL,
	"status" "riot"."sync_status" DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 5 NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"lease_id" uuid,
	"completed_at" timestamp with time zone,
	"failure_code" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riot_sync_revision_nonnegative" CHECK ("riot"."sync_jobs"."revision" >= 0),
	CONSTRAINT "riot_sync_attempts" CHECK ("riot"."sync_jobs"."attempt_count" BETWEEN 0 AND "riot"."sync_jobs"."maximum_attempts" AND "riot"."sync_jobs"."maximum_attempts" BETWEEN 1 AND 10),
	CONSTRAINT "riot_sync_lease_pair" CHECK (("riot"."sync_jobs"."status" = 'RUNNING') = ("riot"."sync_jobs"."locked_at" IS NOT NULL AND "riot"."sync_jobs"."lease_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "riot"."account_links" ADD CONSTRAINT "account_links_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."account_links" ADD CONSTRAINT "account_links_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."command_receipts" ADD CONSTRAINT "command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."rso_states" ADD CONSTRAINT "rso_states_owner_user_account_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."summaries" ADD CONSTRAINT "summaries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."summaries" ADD CONSTRAINT "summaries_link_id_account_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "riot"."account_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."sync_jobs" ADD CONSTRAINT "sync_jobs_link_id_account_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "riot"."account_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "riot_links_player_uidx" ON "riot"."account_links" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "riot_links_owner_status_idx" ON "riot"."account_links" USING btree ("owner_user_account_id","status");--> statement-breakpoint
CREATE INDEX "riot_links_normalized_idx" ON "riot"."account_links" USING btree ("normalized_key");--> statement-breakpoint
CREATE UNIQUE INDEX "riot_receipts_actor_scope_key_uidx" ON "riot"."command_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "riot_receipts_expiry_idx" ON "riot"."command_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "riot_outbox_dedupe_uidx" ON "riot"."outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "riot_outbox_pending_idx" ON "riot"."outbox" USING btree ("created_at","id") WHERE "riot"."outbox"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "riot_rso_state_digest_uidx" ON "riot"."rso_states" USING btree ("state_digest");--> statement-breakpoint
CREATE INDEX "riot_rso_expiry_idx" ON "riot"."rso_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "riot_summaries_link_uidx" ON "riot"."summaries" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "riot_sync_claim_idx" ON "riot"."sync_jobs" USING btree ("status","available_at","id");--> statement-breakpoint
CREATE INDEX "riot_sync_link_requested_idx" ON "riot"."sync_jobs" USING btree ("link_id","requested_at" DESC NULLS LAST);