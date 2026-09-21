CREATE TABLE "recruiting"."kakao_site_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" varchar(100) NOT NULL,
	"round_id" uuid NOT NULL,
	"source_room_id_hash" "bytea" NOT NULL,
	"target_hash" "bytea" NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_token_hash" "bytea",
	"lease_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"failure_code" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kakao_site_notices_status" CHECK ("recruiting"."kakao_site_notices"."status" IN ('PENDING','LEASED','DELIVERED','FAILED','EXPIRED')),
	CONSTRAINT "kakao_site_notices_attempts" CHECK ("recruiting"."kakao_site_notices"."attempts" BETWEEN 0 AND 20),
	CONSTRAINT "kakao_site_notices_hashes" CHECK (octet_length("recruiting"."kakao_site_notices"."source_room_id_hash") = 32 AND octet_length("recruiting"."kakao_site_notices"."target_hash") = 32 AND ("recruiting"."kakao_site_notices"."lease_token_hash" IS NULL OR octet_length("recruiting"."kakao_site_notices"."lease_token_hash") = 32)),
	CONSTRAINT "kakao_site_notices_expiry" CHECK ("recruiting"."kakao_site_notices"."expires_at" > "recruiting"."kakao_site_notices"."created_at"),
	CONSTRAINT "kakao_site_notices_lease" CHECK (("recruiting"."kakao_site_notices"."status" = 'LEASED' AND "recruiting"."kakao_site_notices"."lease_token_hash" IS NOT NULL AND "recruiting"."kakao_site_notices"."lease_until" IS NOT NULL) OR ("recruiting"."kakao_site_notices"."status" <> 'LEASED' AND "recruiting"."kakao_site_notices"."lease_until" IS NULL)),
	CONSTRAINT "kakao_site_notices_delivery" CHECK (("recruiting"."kakao_site_notices"."status" = 'DELIVERED') = ("recruiting"."kakao_site_notices"."delivered_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_site_notices" ADD CONSTRAINT "kakao_site_notices_round_id_season_inhouse_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "competition"."season_inhouse_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_site_notices_event_uidx" ON "recruiting"."kakao_site_notices" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "kakao_site_notices_claim_idx" ON "recruiting"."kakao_site_notices" USING btree ("source_room_id_hash","target_hash","status","available_at");--> statement-breakpoint
CREATE INDEX "kakao_site_notices_expiry_idx" ON "recruiting"."kakao_site_notices" USING btree ("expires_at");