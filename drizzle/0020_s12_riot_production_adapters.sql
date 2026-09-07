CREATE TABLE "riot"."rso_exchange_results" (
	"state_id" uuid PRIMARY KEY NOT NULL,
	"code_digest" bytea NOT NULL,
	"key_id" varchar(32) NOT NULL,
	"protected_identity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "riot_rso_exchange_code_digest" CHECK (octet_length("riot"."rso_exchange_results"."code_digest") = 32),
	CONSTRAINT "riot_rso_exchange_key_id" CHECK (char_length(btrim("riot"."rso_exchange_results"."key_id")) BETWEEN 1 AND 32),
	CONSTRAINT "riot_rso_exchange_protected" CHECK (char_length("riot"."rso_exchange_results"."protected_identity") BETWEEN 32 AND 4000),
	CONSTRAINT "riot_rso_exchange_expiry" CHECK ("riot"."rso_exchange_results"."expires_at" > "riot"."rso_exchange_results"."created_at")
);
--> statement-breakpoint
ALTER TABLE "riot"."rso_exchange_results" ADD CONSTRAINT "rso_exchange_results_state_id_rso_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "riot"."rso_states"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "riot_rso_exchange_expiry_idx" ON "riot"."rso_exchange_results" USING btree ("expires_at");
