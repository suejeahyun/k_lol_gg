CREATE TABLE "recruiting"."kakao_recruit_codes" (
	"code" varchar(11) PRIMARY KEY NOT NULL,
	"scope_hash" "bytea" NOT NULL,
	"target_id" uuid NOT NULL,
	"last_version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kakao_recruit_codes_code" CHECK ("recruiting"."kakao_recruit_codes"."code" ~ '^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$'),
	CONSTRAINT "kakao_recruit_codes_scope_hash" CHECK (octet_length("recruiting"."kakao_recruit_codes"."scope_hash") = 32),
	CONSTRAINT "kakao_recruit_codes_version" CHECK ("recruiting"."kakao_recruit_codes"."last_version" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "recruiting"."kakao_recruit_form_snapshots" (
	"code" varchar(11) NOT NULL,
	"version" bigint NOT NULL,
	"operating_date" date NOT NULL,
	"state_hash" "bytea" NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kakao_recruit_form_snapshots_code_version_pk" PRIMARY KEY("code","version"),
	CONSTRAINT "kakao_recruit_form_snapshots_version" CHECK ("recruiting"."kakao_recruit_form_snapshots"."version" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "kakao_recruit_form_snapshots_state_hash" CHECK (octet_length("recruiting"."kakao_recruit_form_snapshots"."state_hash") = 32),
	CONSTRAINT "kakao_recruit_form_snapshots_state_object" CHECK (jsonb_typeof("recruiting"."kakao_recruit_form_snapshots"."state_json") = 'object' AND octet_length("recruiting"."kakao_recruit_form_snapshots"."state_json"::text) <= 65536),
	CONSTRAINT "kakao_recruit_form_snapshots_expiry" CHECK ("recruiting"."kakao_recruit_form_snapshots"."expires_at" > "recruiting"."kakao_recruit_form_snapshots"."created_at" AND "recruiting"."kakao_recruit_form_snapshots"."expires_at" = (("recruiting"."kakao_recruit_form_snapshots"."operating_date" + 1)::timestamp + interval '6 hours') AT TIME ZONE 'Asia/Seoul')
);
--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_recruit_form_snapshots" ADD CONSTRAINT "kakao_recruit_form_snapshots_code_kakao_recruit_codes_code_fk" FOREIGN KEY ("code") REFERENCES "recruiting"."kakao_recruit_codes"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_recruit_codes_target_uidx" ON "recruiting"."kakao_recruit_codes" USING btree ("scope_hash","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kakao_recruit_form_snapshots_state_uidx" ON "recruiting"."kakao_recruit_form_snapshots" USING btree ("code","operating_date","state_hash");--> statement-breakpoint
CREATE INDEX "kakao_recruit_form_snapshots_expiry_idx" ON "recruiting"."kakao_recruit_form_snapshots" USING btree ("expires_at","code","version");