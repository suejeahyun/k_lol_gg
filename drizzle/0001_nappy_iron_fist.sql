CREATE TYPE "auth"."login_rate_limit_scope" AS ENUM('LOGIN_ID_HASH', 'IP_HASH', 'GLOBAL_HASH');--> statement-breakpoint
CREATE TABLE "auth"."login_rate_limit_buckets" (
	"scope" "auth"."login_rate_limit_scope" NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_rate_limit_key_hash_32_bytes" CHECK (octet_length("auth"."login_rate_limit_buckets"."key_hash") = 32),
	CONSTRAINT "login_rate_limit_attempt_count_nonnegative" CHECK ("auth"."login_rate_limit_buckets"."attempt_count" >= 0),
	CONSTRAINT "login_rate_limit_expiry_after_window" CHECK ("auth"."login_rate_limit_buckets"."expires_at" > "auth"."login_rate_limit_buckets"."window_started_at")
);
--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD COLUMN "token_hash" "bytea";--> statement-breakpoint
UPDATE "auth"."sessions"
SET
	"token_hash" = decode(
		replace("id"::text, '-', '') || replace("id"::text, '-', ''),
		'hex'
	),
	"revoked_at" = coalesce("revoked_at", now());--> statement-breakpoint
ALTER TABLE "auth"."sessions" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "login_rate_limit_bucket_uidx" ON "auth"."login_rate_limit_buckets" USING btree ("scope","key_hash","window_started_at");--> statement-breakpoint
CREATE INDEX "login_rate_limit_expires_at_idx" ON "auth"."login_rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "login_rate_limit_blocked_until_idx" ON "auth"."login_rate_limit_buckets" USING btree ("blocked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "auth"."sessions" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_token_hash_32_bytes" CHECK (octet_length("auth"."sessions"."token_hash") = 32);
