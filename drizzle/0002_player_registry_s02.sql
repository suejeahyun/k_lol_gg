CREATE TABLE "registry"."player_mutation_receipts" (
	"actor_user_account_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"response_etag" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "player_mutation_receipts_key_hash_32_bytes" CHECK (octet_length("registry"."player_mutation_receipts"."key_hash") = 32),
	CONSTRAINT "player_mutation_receipts_request_hash_32_bytes" CHECK (octet_length("registry"."player_mutation_receipts"."request_hash") = 32),
	CONSTRAINT "player_mutation_receipts_status_success" CHECK ("registry"."player_mutation_receipts"."response_status" >= 200 AND "registry"."player_mutation_receipts"."response_status" <= 299),
	CONSTRAINT "player_mutation_receipts_expiry_after_creation" CHECK ("registry"."player_mutation_receipts"."expires_at" > "registry"."player_mutation_receipts"."created_at")
);
--> statement-breakpoint
ALTER TABLE "registry"."players" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "registry"."player_mutation_receipts" ADD CONSTRAINT "player_mutation_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_mutation_receipts_actor_scope_key_uidx" ON "registry"."player_mutation_receipts" USING btree ("actor_user_account_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "player_mutation_receipts_expires_at_idx" ON "registry"."player_mutation_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "players_legacy_id_uidx" ON "registry"."players" USING btree ("legacy_id");--> statement-breakpoint
ALTER TABLE "registry"."players" ADD CONSTRAINT "players_legacy_id_positive" CHECK ("registry"."players"."legacy_id" IS NULL OR "registry"."players"."legacy_id" > 0);