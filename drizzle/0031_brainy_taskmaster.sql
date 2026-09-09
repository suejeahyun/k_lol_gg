CREATE TYPE "recruiting"."kakao_bot_installation_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "recruiting"."kakao_room_member_role" AS ENUM('MEMBER', 'MANAGER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "recruiting"."kakao_room_registration_source" AS ENUM('BOOTSTRAP', 'PAIRING', 'ADMIN');--> statement-breakpoint
CREATE TYPE "recruiting"."kakao_room_status" AS ENUM('ACTIVE', 'PAUSED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_bot_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"public_id" varchar(128) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"status" "recruiting"."kakao_bot_installation_status" DEFAULT 'ACTIVE' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_bot_installations_revision_nonnegative" CHECK ("recruiting"."kakao_bot_installations"."revision" >= 0),
	CONSTRAINT "kakao_bot_installations_public" CHECK (char_length(btrim("recruiting"."kakao_bot_installations"."public_id")) BETWEEN 8 AND 128),
	CONSTRAINT "kakao_bot_installations_name" CHECK (char_length(btrim("recruiting"."kakao_bot_installations"."display_name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_room_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"installation_id" uuid NOT NULL,
	"local_room_fingerprint" varchar(128) NOT NULL,
	"room_id" uuid NOT NULL,
	"registration_source" "recruiting"."kakao_room_registration_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_room_bindings_revision_nonnegative" CHECK ("recruiting"."kakao_room_bindings"."revision" >= 0),
	CONSTRAINT "kakao_room_bindings_local" CHECK (char_length(btrim("recruiting"."kakao_room_bindings"."local_room_fingerprint")) BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_room_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"room_id" uuid NOT NULL,
	"sender_fingerprint" varchar(128) NOT NULL,
	"linked_user_account_id" uuid,
	"linked_player_id" uuid,
	"role" "recruiting"."kakao_room_member_role" DEFAULT 'MEMBER' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_room_members_revision_nonnegative" CHECK ("recruiting"."kakao_room_members"."revision" >= 0),
	CONSTRAINT "kakao_room_members_sender" CHECK (char_length(btrim("recruiting"."kakao_room_members"."sender_fingerprint")) BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_room_pairings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_room_id" uuid,
	"display_name" varchar(120) NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_room_id" uuid,
	"consumed_installation_id" uuid,
	"consumed_local_room_fingerprint" varchar(128),
	"consumed_sender_fingerprint" varchar(128),
	"consumed_request_key_hash" "bytea",
	"created_by_user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_room_pairings_code_hash" CHECK (octet_length("recruiting"."kakao_room_pairings"."code_hash") = 32),
	CONSTRAINT "kakao_room_pairings_name" CHECK (char_length(btrim("recruiting"."kakao_room_pairings"."display_name")) BETWEEN 1 AND 120),
	CONSTRAINT "kakao_room_pairings_expiry" CHECK ("recruiting"."kakao_room_pairings"."expires_at" > "recruiting"."kakao_room_pairings"."created_at"),
	CONSTRAINT "kakao_room_pairings_local" CHECK ("recruiting"."kakao_room_pairings"."consumed_local_room_fingerprint" IS NULL OR char_length(btrim("recruiting"."kakao_room_pairings"."consumed_local_room_fingerprint")) BETWEEN 8 AND 128),
	CONSTRAINT "kakao_room_pairings_sender" CHECK ("recruiting"."kakao_room_pairings"."consumed_sender_fingerprint" IS NULL OR char_length(btrim("recruiting"."kakao_room_pairings"."consumed_sender_fingerprint")) BETWEEN 8 AND 128),
	CONSTRAINT "kakao_room_pairings_request_key" CHECK ("recruiting"."kakao_room_pairings"."consumed_request_key_hash" IS NULL OR octet_length("recruiting"."kakao_room_pairings"."consumed_request_key_hash") = 32),
	CONSTRAINT "kakao_room_pairings_consumption" CHECK (("recruiting"."kakao_room_pairings"."consumed_at" IS NULL AND "recruiting"."kakao_room_pairings"."consumed_room_id" IS NULL AND "recruiting"."kakao_room_pairings"."consumed_installation_id" IS NULL AND "recruiting"."kakao_room_pairings"."consumed_local_room_fingerprint" IS NULL AND "recruiting"."kakao_room_pairings"."consumed_sender_fingerprint" IS NULL AND "recruiting"."kakao_room_pairings"."consumed_request_key_hash" IS NULL) OR ("recruiting"."kakao_room_pairings"."consumed_at" IS NOT NULL AND "recruiting"."kakao_room_pairings"."consumed_room_id" IS NOT NULL AND "recruiting"."kakao_room_pairings"."consumed_installation_id" IS NOT NULL AND "recruiting"."kakao_room_pairings"."consumed_local_room_fingerprint" IS NOT NULL AND "recruiting"."kakao_room_pairings"."consumed_sender_fingerprint" IS NOT NULL AND "recruiting"."kakao_room_pairings"."consumed_request_key_hash" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"status" "recruiting"."kakao_room_status" DEFAULT 'ACTIVE' NOT NULL,
	"registration_source" "recruiting"."kakao_room_registration_source" NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"registered_by_user_account_id" uuid,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_rooms_revision_nonnegative" CHECK ("recruiting"."kakao_rooms"."revision" >= 0),
	CONSTRAINT "kakao_rooms_display_name" CHECK (char_length(btrim("recruiting"."kakao_rooms"."display_name")) BETWEEN 1 AND 120),
	CONSTRAINT "kakao_rooms_policy_version" CHECK ("recruiting"."kakao_rooms"."policy_version" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_bindings" ADD CONSTRAINT "kakao_room_bindings_installation_id_kakao_bot_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "recruiting"."kakao_bot_installations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_bindings" ADD CONSTRAINT "kakao_room_bindings_room_id_kakao_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "recruiting"."kakao_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_members" ADD CONSTRAINT "kakao_room_members_room_id_kakao_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "recruiting"."kakao_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_members" ADD CONSTRAINT "kakao_room_members_linked_user_account_id_user_accounts_id_fk" FOREIGN KEY ("linked_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_members" ADD CONSTRAINT "kakao_room_members_linked_player_id_players_id_fk" FOREIGN KEY ("linked_player_id") REFERENCES "registry"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_pairings" ADD CONSTRAINT "kakao_room_pairings_target_room_id_kakao_rooms_id_fk" FOREIGN KEY ("target_room_id") REFERENCES "recruiting"."kakao_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_pairings" ADD CONSTRAINT "kakao_room_pairings_consumed_room_id_kakao_rooms_id_fk" FOREIGN KEY ("consumed_room_id") REFERENCES "recruiting"."kakao_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_pairings" ADD CONSTRAINT "kakao_room_pairings_consumed_installation_id_kakao_bot_installations_id_fk" FOREIGN KEY ("consumed_installation_id") REFERENCES "recruiting"."kakao_bot_installations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_room_pairings" ADD CONSTRAINT "kakao_room_pairings_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_rooms" ADD CONSTRAINT "kakao_rooms_registered_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("registered_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_bot_installations_public_uidx" ON "recruiting"."kakao_bot_installations" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "kakao_bot_installations_status_idx" ON "recruiting"."kakao_bot_installations" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_room_bindings_installation_local_uidx" ON "recruiting"."kakao_room_bindings" USING btree ("installation_id","local_room_fingerprint");--> statement-breakpoint
CREATE INDEX "kakao_room_bindings_room_idx" ON "recruiting"."kakao_room_bindings" USING btree ("room_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_room_members_room_sender_uidx" ON "recruiting"."kakao_room_members" USING btree ("room_id","sender_fingerprint");--> statement-breakpoint
CREATE INDEX "kakao_room_members_room_role_idx" ON "recruiting"."kakao_room_members" USING btree ("room_id","role","updated_at");--> statement-breakpoint
CREATE INDEX "kakao_room_members_user_idx" ON "recruiting"."kakao_room_members" USING btree ("linked_user_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_room_pairings_code_uidx" ON "recruiting"."kakao_room_pairings" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "kakao_room_pairings_expiry_idx" ON "recruiting"."kakao_room_pairings" USING btree ("expires_at","consumed_at");--> statement-breakpoint
CREATE INDEX "kakao_rooms_status_idx" ON "recruiting"."kakao_rooms" USING btree ("status","updated_at");