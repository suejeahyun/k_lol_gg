CREATE SCHEMA "legacy";
--> statement-breakpoint
CREATE TABLE "legacy"."functional_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"record_kind" varchar(64) NOT NULL,
	"source_table" varchar(64) NOT NULL,
	"source_key" varchar(128) NOT NULL,
	"source_legacy_id" bigint NOT NULL,
	"payload_json" jsonb NOT NULL,
	"payload_sha256" "bytea" NOT NULL,
	"source_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_functional_records_legacy_id_positive" CHECK ("legacy"."functional_records"."source_legacy_id" > 0),
	CONSTRAINT "legacy_functional_records_payload_object" CHECK (jsonb_typeof("legacy"."functional_records"."payload_json") = 'object'),
	CONSTRAINT "legacy_functional_records_payload_sha256" CHECK (octet_length("legacy"."functional_records"."payload_sha256") = 32)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_functional_records_source_uidx" ON "legacy"."functional_records" USING btree ("source_table","source_key");--> statement-breakpoint
CREATE INDEX "legacy_functional_records_kind_id_idx" ON "legacy"."functional_records" USING btree ("record_kind","source_legacy_id");