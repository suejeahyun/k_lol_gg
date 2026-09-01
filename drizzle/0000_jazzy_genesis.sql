CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "registry";
--> statement-breakpoint
CREATE TYPE "auth"."account_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "auth"."session_kind" AS ENUM('USER', 'E2E_FIXTURE');--> statement-breakpoint
CREATE TYPE "auth"."user_role" AS ENUM('USER', 'ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "registry"."player_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "audit"."events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit"."events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" uuid NOT NULL,
	"actor_user_account_id" uuid,
	"action" varchar(96) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."admin_totp_credentials" (
	"user_account_id" uuid PRIMARY KEY NOT NULL,
	"secret_ciphertext" "bytea" NOT NULL,
	"secret_iv" "bytea" NOT NULL,
	"secret_auth_tag" "bytea" NOT NULL,
	"key_version" integer NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_used_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_totp_credentials_ciphertext_nonempty" CHECK (octet_length("auth"."admin_totp_credentials"."secret_ciphertext") > 0),
	CONSTRAINT "admin_totp_credentials_iv_12_bytes" CHECK (octet_length("auth"."admin_totp_credentials"."secret_iv") = 12),
	CONSTRAINT "admin_totp_credentials_auth_tag_16_bytes" CHECK (octet_length("auth"."admin_totp_credentials"."secret_auth_tag") = 16),
	CONSTRAINT "admin_totp_credentials_key_version_positive" CHECK ("auth"."admin_totp_credentials"."key_version" > 0),
	CONSTRAINT "admin_totp_credentials_last_step_nonnegative" CHECK ("auth"."admin_totp_credentials"."last_used_step" IS NULL OR "auth"."admin_totp_credentials"."last_used_step" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_account_id" uuid NOT NULL,
	"auth_version" integer NOT NULL,
	"role" "auth"."user_role" NOT NULL,
	"totp_verified_at" timestamp with time zone,
	"kind" "auth"."session_kind" DEFAULT 'USER' NOT NULL,
	"fixture_id" varchar(128),
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_auth_version_nonnegative" CHECK ("auth"."sessions"."auth_version" >= 0),
	CONSTRAINT "sessions_expiry_after_issue" CHECK ("auth"."sessions"."expires_at" > "auth"."sessions"."issued_at"),
	CONSTRAINT "sessions_fixture_kind_consistency" CHECK ((
        ("auth"."sessions"."kind" = 'E2E_FIXTURE' AND "auth"."sessions"."fixture_id" IS NOT NULL)
        OR
        ("auth"."sessions"."kind" = 'USER' AND "auth"."sessions"."fixture_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "auth"."user_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"login_id" varchar(64) NOT NULL,
	"login_id_normalized" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "auth"."user_role" DEFAULT 'USER' NOT NULL,
	"status" "auth"."account_status" DEFAULT 'PENDING' NOT NULL,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"privacy_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_accounts_auth_version_nonnegative" CHECK ("auth"."user_accounts"."auth_version" >= 0),
	CONSTRAINT "user_accounts_login_id_normalized_nonempty" CHECK (char_length("auth"."user_accounts"."login_id_normalized") > 0)
);
--> statement-breakpoint
CREATE TABLE "registry"."players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_account_id" uuid,
	"member_name" varchar(100) NOT NULL,
	"member_name_normalized" varchar(100) NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"nickname_normalized" varchar(64) NOT NULL,
	"tag_line" varchar(32) NOT NULL,
	"tag_line_normalized" varchar(32) NOT NULL,
	"peak_tier" varchar(32),
	"current_tier" varchar(32),
	"status" "registry"."player_status" DEFAULT 'ACTIVE' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_member_name_normalized_nonempty" CHECK (char_length("registry"."players"."member_name_normalized") > 0),
	CONSTRAINT "players_nickname_normalized_nonempty" CHECK (char_length("registry"."players"."nickname_normalized") > 0),
	CONSTRAINT "players_tag_line_normalized_nonempty" CHECK (char_length("registry"."players"."tag_line_normalized") > 0),
	CONSTRAINT "players_revision_nonnegative" CHECK ("registry"."players"."revision" >= 0),
	CONSTRAINT "players_status_deactivated_consistency" CHECK ((
        ("registry"."players"."status" = 'ACTIVE' AND "registry"."players"."deactivated_at" IS NULL)
        OR
        ("registry"."players"."status" = 'INACTIVE' AND "registry"."players"."deactivated_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."admin_totp_credentials" ADD CONSTRAINT "admin_totp_credentials_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."players" ADD CONSTRAINT "players_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit"."events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_at_idx" ON "audit"."events" USING btree ("actor_user_account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit"."events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_request_id_idx" ON "audit"."events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "sessions_user_revoked_idx" ON "auth"."sessions" USING btree ("user_account_id","revoked_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "auth"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_accounts_login_id_normalized_uidx" ON "auth"."user_accounts" USING btree ("login_id_normalized");--> statement-breakpoint
CREATE INDEX "user_accounts_status_role_idx" ON "auth"."user_accounts" USING btree ("status","role");--> statement-breakpoint
CREATE INDEX "user_accounts_deleted_at_idx" ON "auth"."user_accounts" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_user_account_id_uidx" ON "registry"."players" USING btree ("user_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_nickname_tag_line_normalized_uidx" ON "registry"."players" USING btree ("nickname_normalized","tag_line_normalized");--> statement-breakpoint
CREATE INDEX "players_status_updated_at_idx" ON "registry"."players" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "players_nickname_normalized_idx" ON "registry"."players" USING btree ("nickname_normalized");--> statement-breakpoint
CREATE INDEX "players_member_name_normalized_idx" ON "registry"."players" USING btree ("member_name_normalized");