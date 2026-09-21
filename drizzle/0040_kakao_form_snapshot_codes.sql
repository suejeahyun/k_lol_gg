CREATE TABLE "recruiting"."kakao_form_snapshots" (
	"code" varchar(11) PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"scope_hash" "bytea" NOT NULL,
	"target_id" varchar(160) NOT NULL,
	"operating_date" date NOT NULL,
	"state_hash" "bytea" NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kakao_form_snapshots_code" CHECK ("recruiting"."kakao_form_snapshots"."code" ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$'),
	CONSTRAINT "kakao_form_snapshots_kind" CHECK ("recruiting"."kakao_form_snapshots"."kind" IN ('PARTY', 'INHOUSE')),
	CONSTRAINT "kakao_form_snapshots_scope_hash" CHECK (octet_length("recruiting"."kakao_form_snapshots"."scope_hash") = 32),
	CONSTRAINT "kakao_form_snapshots_target" CHECK (char_length(btrim("recruiting"."kakao_form_snapshots"."target_id")) BETWEEN 1 AND 160),
	CONSTRAINT "kakao_form_snapshots_state_hash" CHECK (octet_length("recruiting"."kakao_form_snapshots"."state_hash") = 32),
	CONSTRAINT "kakao_form_snapshots_state_object" CHECK (jsonb_typeof("recruiting"."kakao_form_snapshots"."state_json") = 'object' AND octet_length("recruiting"."kakao_form_snapshots"."state_json"::text) <= 65536),
	CONSTRAINT "kakao_form_snapshots_expiry" CHECK ("recruiting"."kakao_form_snapshots"."expires_at" > "recruiting"."kakao_form_snapshots"."created_at" AND "recruiting"."kakao_form_snapshots"."expires_at" = (("recruiting"."kakao_form_snapshots"."operating_date" + 1)::timestamp + interval '6 hours') AT TIME ZONE 'Asia/Seoul')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_form_snapshots_state_uidx" ON "recruiting"."kakao_form_snapshots" USING btree ("kind","scope_hash","target_id","operating_date","state_hash");--> statement-breakpoint
CREATE INDEX "kakao_form_snapshots_expiry_idx" ON "recruiting"."kakao_form_snapshots" USING btree ("expires_at","code");