DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT login_id AS value FROM auth.user_accounts
        UNION ALL SELECT login_id_normalized FROM auth.user_accounts
        UNION ALL SELECT member_name FROM registry.players
        UNION ALL SELECT member_name_normalized FROM registry.players
        UNION ALL SELECT nickname FROM registry.players
        UNION ALL SELECT nickname_normalized FROM registry.players
        UNION ALL SELECT tag_line FROM registry.players
        UNION ALL SELECT tag_line_normalized FROM registry.players
      ) AS existing_identity
     WHERE existing_identity.value <> normalize(existing_identity.value, NFKC)
        OR EXISTS (
          SELECT 1
            FROM (
              VALUES
                (1, 31), (127, 159), (173, 173),
                (1536, 1541), (1564, 1564), (1757, 1757),
                (1807, 1807), (2192, 2193), (2274, 2274), (6158, 6158),
                (8203, 8207), (8234, 8238), (8288, 8292), (8294, 8303),
                (65024, 65039), (65279, 65279), (65529, 65531),
                (69821, 69821), (69837, 69837),
                (78896, 78911), (113824, 113827), (119155, 119162),
                (917505, 917505), (917536, 917631), (917760, 917999)
            ) AS unsafe_range(first_codepoint, last_codepoint)
            CROSS JOIN LATERAL generate_series(
              unsafe_range.first_codepoint,
              unsafe_range.last_codepoint
            ) AS unsafe_codepoint
           WHERE strpos(existing_identity.value, chr(unsafe_codepoint)) > 0
        )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = '0004 identity preflight found non-NFKC or invisible-control legacy data; review and normalize it before retrying';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "auth"."password_reset_request_status" AS ENUM('PENDING', 'RESOLVED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "auth"."session_purpose" AS ENUM('ACCOUNT', 'ADMIN');--> statement-breakpoint
CREATE TYPE "registry"."player_account_claim_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "auth"."account_mutation_receipts" (
	"actor_user_account_id" uuid,
	"principal_key_hash" "bytea" NOT NULL,
	"scope" varchar(128) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"one_time_secret_issued" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_mutation_receipts_principal_hash_32_bytes" CHECK (octet_length("auth"."account_mutation_receipts"."principal_key_hash") = 32),
	CONSTRAINT "account_mutation_receipts_key_hash_32_bytes" CHECK (octet_length("auth"."account_mutation_receipts"."key_hash") = 32),
	CONSTRAINT "account_mutation_receipts_request_hash_32_bytes" CHECK (octet_length("auth"."account_mutation_receipts"."request_hash") = 32),
	CONSTRAINT "account_mutation_receipts_status_success" CHECK ("auth"."account_mutation_receipts"."response_status" >= 200 AND "auth"."account_mutation_receipts"."response_status" <= 299),
	CONSTRAINT "account_mutation_receipts_expiry_after_creation" CHECK ("auth"."account_mutation_receipts"."expires_at" > "auth"."account_mutation_receipts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "auth"."account_status_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auth"."account_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_account_id" uuid NOT NULL,
	"actor_user_account_id" uuid,
	"action" varchar(64) NOT NULL,
	"previous_status" "auth"."account_status",
	"next_status" "auth"."account_status" NOT NULL,
	"public_reason" varchar(500),
	"internal_reason" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."password_reset_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_account_id" uuid NOT NULL,
	"login_id_hash" "bytea" NOT NULL,
	"status" "auth"."password_reset_request_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_account_id" uuid,
	CONSTRAINT "password_reset_requests_login_hash_32_bytes" CHECK (octet_length("auth"."password_reset_requests"."login_id_hash") = 32),
	CONSTRAINT "password_reset_requests_expiry_after_request" CHECK ("auth"."password_reset_requests"."expires_at" > "auth"."password_reset_requests"."requested_at"),
	CONSTRAINT "password_reset_requests_resolution_after_request" CHECK ("auth"."password_reset_requests"."resolved_at" IS NULL OR "auth"."password_reset_requests"."resolved_at" >= "auth"."password_reset_requests"."requested_at"),
	CONSTRAINT "password_reset_requests_resolution_consistency" CHECK ((
		("auth"."password_reset_requests"."status" = 'PENDING' AND "auth"."password_reset_requests"."resolved_at" IS NULL AND "auth"."password_reset_requests"."resolved_by_user_account_id" IS NULL)
		OR
		("auth"."password_reset_requests"."status" = 'RESOLVED' AND "auth"."password_reset_requests"."resolved_at" IS NOT NULL AND "auth"."password_reset_requests"."resolved_by_user_account_id" IS NOT NULL)
		OR
		("auth"."password_reset_requests"."status" = 'CANCELLED' AND "auth"."password_reset_requests"."resolved_at" IS NOT NULL AND "auth"."password_reset_requests"."resolved_by_user_account_id" IS NOT NULL)
		OR
		("auth"."password_reset_requests"."status" = 'EXPIRED' AND "auth"."password_reset_requests"."resolved_at" IS NOT NULL AND "auth"."password_reset_requests"."resolved_by_user_account_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "registry"."player_account_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_account_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"requested_member_name" varchar(100) NOT NULL,
	"requested_riot_id" varchar(97) NOT NULL,
	"status" "registry"."player_account_claim_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_user_account_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_account_claims_review_consistency" CHECK ((
        ("registry"."player_account_claims"."status" = 'PENDING' AND "registry"."player_account_claims"."reviewed_at" IS NULL AND "registry"."player_account_claims"."reviewed_by_user_account_id" IS NULL)
        OR
        ("registry"."player_account_claims"."status" <> 'PENDING' AND "registry"."player_account_claims"."reviewed_at" IS NOT NULL AND "registry"."player_account_claims"."reviewed_by_user_account_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD COLUMN "purpose" "auth"."session_purpose";--> statement-breakpoint
UPDATE "auth"."sessions"
   SET "purpose" = 'ACCOUNT',
       "revoked_at" = coalesce("revoked_at", now()),
       "totp_verified_at" = NULL;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ALTER COLUMN "purpose" SET DEFAULT 'ACCOUNT';--> statement-breakpoint
ALTER TABLE "auth"."sessions" ALTER COLUMN "purpose" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "status_reason_public" varchar(500);--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "status_reason_internal" varchar(1000);--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "terms_version" varchar(32);--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD COLUMN "privacy_version" varchar(32);--> statement-breakpoint
UPDATE "auth"."user_accounts"
   SET "terms_version" = 'legacy-unversioned'
 WHERE "terms_accepted_at" IS NOT NULL
   AND "terms_version" IS NULL;--> statement-breakpoint
UPDATE "auth"."user_accounts"
   SET "privacy_version" = 'legacy-unversioned'
 WHERE "privacy_accepted_at" IS NOT NULL
   AND "privacy_version" IS NULL;--> statement-breakpoint
ALTER TABLE "registry"."players" ADD COLUMN "account_lifecycle_deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."account_mutation_receipts" ADD CONSTRAINT "account_mutation_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."account_status_history" ADD CONSTRAINT "account_status_history_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."account_status_history" ADD CONSTRAINT "account_status_history_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolved_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("resolved_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."player_account_claims" ADD CONSTRAINT "player_account_claims_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."player_account_claims" ADD CONSTRAINT "player_account_claims_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry"."player_account_claims" ADD CONSTRAINT "player_account_claims_reviewed_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("reviewed_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_mutation_receipts_principal_scope_key_uidx" ON "auth"."account_mutation_receipts" USING btree ("principal_key_hash","scope","key_hash");--> statement-breakpoint
CREATE INDEX "account_mutation_receipts_expires_at_idx" ON "auth"."account_mutation_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_status_history_account_created_idx" ON "auth"."account_status_history" USING btree ("user_account_id","created_at");--> statement-breakpoint
CREATE INDEX "account_status_history_actor_created_idx" ON "auth"."account_status_history" USING btree ("actor_user_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_requests_active_account_uidx" ON "auth"."password_reset_requests" USING btree ("user_account_id") WHERE "auth"."password_reset_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "password_reset_requests_status_requested_idx" ON "auth"."password_reset_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "password_reset_requests_expires_at_idx" ON "auth"."password_reset_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "player_account_claims_pending_account_uidx" ON "registry"."player_account_claims" USING btree ("user_account_id") WHERE "registry"."player_account_claims"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "player_account_claims_pending_player_uidx" ON "registry"."player_account_claims" USING btree ("player_id") WHERE "registry"."player_account_claims"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "player_account_claims_account_updated_idx" ON "registry"."player_account_claims" USING btree ("user_account_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "player_account_claims_status_created_idx" ON "registry"."player_account_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_accounts_legacy_id_uidx" ON "auth"."user_accounts" USING btree ("legacy_id");--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_purpose_role_consistency" CHECK ((
        ("auth"."sessions"."purpose" = 'ACCOUNT' AND "auth"."sessions"."totp_verified_at" IS NULL)
        OR
        ("auth"."sessions"."purpose" = 'ADMIN' AND "auth"."sessions"."role" IN ('ADMIN', 'SUPER_ADMIN'))
      ));--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD CONSTRAINT "user_accounts_revision_nonnegative" CHECK ("auth"."user_accounts"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD CONSTRAINT "user_accounts_legacy_id_positive" CHECK ("auth"."user_accounts"."legacy_id" IS NULL OR "auth"."user_accounts"."legacy_id" > 0);--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD CONSTRAINT "user_accounts_terms_evidence_consistency" CHECK ((
        ("auth"."user_accounts"."terms_accepted_at" IS NULL AND "auth"."user_accounts"."terms_version" IS NULL)
        OR
        ("auth"."user_accounts"."terms_accepted_at" IS NOT NULL AND char_length("auth"."user_accounts"."terms_version") > 0)
      ));--> statement-breakpoint
ALTER TABLE "auth"."user_accounts" ADD CONSTRAINT "user_accounts_privacy_evidence_consistency" CHECK ((
        ("auth"."user_accounts"."privacy_accepted_at" IS NULL AND "auth"."user_accounts"."privacy_version" IS NULL)
        OR
        ("auth"."user_accounts"."privacy_accepted_at" IS NOT NULL AND char_length("auth"."user_accounts"."privacy_version") > 0)
      ));--> statement-breakpoint
ALTER TABLE "registry"."players" ADD CONSTRAINT "players_account_lifecycle_deactivation_consistency" CHECK ("registry"."players"."account_lifecycle_deactivated_at" IS NULL OR ("registry"."players"."status" = 'INACTIVE' AND "registry"."players"."deactivated_at" IS NOT NULL));
