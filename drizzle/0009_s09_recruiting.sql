CREATE SCHEMA "recruiting";
--> statement-breakpoint
CREATE TYPE "recruiting"."party_type" AS ENUM('FLEX_RANK', 'NORMAL_GAME', 'SOLO_RANK', 'ARAM', 'TFT_NORMAL', 'TFT_RANK', 'DOUBLE_UP', 'PARTY_NUMBER', 'PARTY_RIFT', 'OTHER_GAME');
--> statement-breakpoint
CREATE TYPE "recruiting"."party_status" AS ENUM('DRAFT', 'IN_PROGRESS', 'FINISHED', 'CANCELED', 'RESET');
--> statement-breakpoint
CREATE TYPE "recruiting"."scrim_status" AS ENUM('RECRUITING', 'MATCHED', 'CONFIRMED', 'COMPLETED', 'CANCELED');
--> statement-breakpoint
CREATE TYPE "recruiting"."outbox_status" AS ENUM('PENDING', 'DELIVERED');
--> statement-breakpoint
CREATE TABLE "recruiting"."parties" (
  "id" uuid PRIMARY KEY NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "owner_user_account_id" uuid,
  "recruit_date" date NOT NULL,
  "reset_sequence" integer DEFAULT 0 NOT NULL,
  "recruit_number" integer NOT NULL,
  "type" "recruiting"."party_type" NOT NULL,
  "status" "recruiting"."party_status" NOT NULL,
  "title" varchar(160) NOT NULL,
  "maximum_members" integer NOT NULL,
  "members_json" jsonb NOT NULL,
  "scheduled_start_at" timestamp with time zone,
  "protected_until" timestamp with time zone,
  "last_activity_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recruit_parties_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "recruit_parties_reset_nonnegative" CHECK ("reset_sequence" >= 0),
  CONSTRAINT "recruit_parties_number_range" CHECK ("recruit_number" BETWEEN 1 AND 99),
  CONSTRAINT "recruit_parties_capacity_range" CHECK ("maximum_members" BETWEEN 1 AND 99),
  CONSTRAINT "recruit_parties_title_nonempty" CHECK (char_length(btrim("title")) BETWEEN 1 AND 160),
  CONSTRAINT "recruit_parties_members_array" CHECK (jsonb_typeof("members_json") = 'array' AND jsonb_array_length("members_json") <= "maximum_members"),
  CONSTRAINT "recruit_parties_protection_order" CHECK ("protected_until" IS NULL OR "scheduled_start_at" IS NULL OR "protected_until" >= "scheduled_start_at")
);
--> statement-breakpoint
CREATE TABLE "recruiting"."scrims" (
  "id" uuid PRIMARY KEY NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "owner_user_account_id" uuid,
  "recruit_date" date NOT NULL,
  "scrim_number" integer NOT NULL,
  "tournament_id" uuid NOT NULL,
  "requester_team_id" uuid NOT NULL,
  "opponent_team_id" uuid,
  "status" "recruiting"."scrim_status" NOT NULL,
  "scheduled_at" timestamp with time zone,
  "best_of" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scrim_recruits_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "scrim_recruits_number_range" CHECK ("scrim_number" BETWEEN 1 AND 99),
  CONSTRAINT "scrim_recruits_best_of" CHECK ("best_of" IN (1, 3, 5)),
  CONSTRAINT "scrim_recruits_distinct_teams" CHECK ("opponent_team_id" IS NULL OR "opponent_team_id" <> "requester_team_id"),
  CONSTRAINT "scrim_recruits_status_team_consistency" CHECK (("status" = 'RECRUITING' AND "opponent_team_id" IS NULL) OR "status" <> 'RECRUITING')
);
--> statement-breakpoint
CREATE TABLE "recruiting"."command_receipts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_principal_id" varchar(160) NOT NULL,
  "scope" varchar(160) NOT NULL,
  "key_hash" bytea NOT NULL,
  "request_hash" bytea NOT NULL,
  "body_digest_hex" varchar(64) NOT NULL,
  "response_status" integer,
  "response_json" jsonb,
  "response_revision" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "recruiting_receipts_key_hash" CHECK (octet_length("key_hash") = 32),
  CONSTRAINT "recruiting_receipts_request_hash" CHECK (octet_length("request_hash") = 32),
  CONSTRAINT "recruiting_receipts_body_digest" CHECK ("body_digest_hex" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "recruiting_receipts_result_consistency" CHECK (("response_status" IS NULL AND "response_json" IS NULL AND "response_revision" IS NULL) OR ("response_status" BETWEEN 200 AND 299 AND "response_json" IS NOT NULL AND "response_revision" >= 0)),
  CONSTRAINT "recruiting_receipts_expiry" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "recruiting"."nonce_bindings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_kind" varchar(12) NOT NULL,
  "actor_principal_id" varchar(160) NOT NULL,
  "nonce_hash" bytea NOT NULL,
  "binding_hash" bytea NOT NULL,
  "key_id" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "recruiting_nonce_actor_kind" CHECK ("actor_kind" IN ('BOT', 'JOB')),
  CONSTRAINT "recruiting_nonce_hash" CHECK (octet_length("nonce_hash") = 32),
  CONSTRAINT "recruiting_nonce_binding_hash" CHECK (octet_length("binding_hash") = 32),
  CONSTRAINT "recruiting_nonce_expiry" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "recruiting"."outbox" (
  "id" varchar(200) PRIMARY KEY NOT NULL,
  "request_id" uuid NOT NULL,
  "aggregate_type" varchar(32) NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "aggregate_revision" bigint NOT NULL,
  "event_type" varchar(96) NOT NULL,
  "dedupe_key" varchar(240) NOT NULL,
  "payload_json" jsonb NOT NULL,
  "status" "recruiting"."outbox_status" DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  CONSTRAINT "recruiting_outbox_aggregate_type" CHECK ("aggregate_type" IN ('RECRUIT_PARTY', 'SCRIM_RECRUIT')),
  CONSTRAINT "recruiting_outbox_revision_nonnegative" CHECK ("aggregate_revision" >= 0),
  CONSTRAINT "recruiting_outbox_payload_object" CHECK (jsonb_typeof("payload_json") = 'object'),
  CONSTRAINT "recruiting_outbox_delivery_consistency" CHECK (("status" = 'PENDING' AND "delivered_at" IS NULL) OR ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_owner_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_owner_fk" FOREIGN KEY ("owner_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "recruit_parties_date_reset_number_uidx" ON "recruiting"."parties" ("recruit_date", "reset_sequence", "recruit_number");
--> statement-breakpoint
CREATE INDEX "recruit_parties_public_idx" ON "recruiting"."parties" ("status", "recruit_date", "recruit_number");
--> statement-breakpoint
CREATE INDEX "recruit_parties_owner_idx" ON "recruiting"."parties" ("owner_user_account_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "scrim_recruits_date_number_uidx" ON "recruiting"."scrims" ("recruit_date", "scrim_number");
--> statement-breakpoint
CREATE INDEX "scrim_recruits_public_idx" ON "recruiting"."scrims" ("status", "recruit_date", "scrim_number");
--> statement-breakpoint
CREATE INDEX "scrim_recruits_owner_idx" ON "recruiting"."scrims" ("owner_user_account_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_receipts_principal_scope_key_uidx" ON "recruiting"."command_receipts" ("actor_principal_id", "scope", "key_hash");
--> statement-breakpoint
CREATE INDEX "recruiting_receipts_expiry_idx" ON "recruiting"."command_receipts" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_nonce_principal_hash_uidx" ON "recruiting"."nonce_bindings" ("actor_principal_id", "nonce_hash");
--> statement-breakpoint
CREATE INDEX "recruiting_nonce_expiry_idx" ON "recruiting"."nonce_bindings" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_outbox_request_uidx" ON "recruiting"."outbox" ("request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_outbox_dedupe_uidx" ON "recruiting"."outbox" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "recruiting_outbox_pending_idx" ON "recruiting"."outbox" ("created_at", "id") WHERE "status" = 'PENDING';

