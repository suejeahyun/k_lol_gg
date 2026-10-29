CREATE TABLE "operations"."community_introduction" (
	"id" integer PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"summary" varchar(160) DEFAULT '' NOT NULL,
	"introduction" varchar(3000) DEFAULT '' NOT NULL,
	"activities" varchar(600) DEFAULT '' NOT NULL,
	"activity_hours" varchar(160) DEFAULT '' NOT NULL,
	"joining_info" varchar(1000) DEFAULT '' NOT NULL,
	"contact_url" varchar(500),
	"banner_url" varchar(500),
	"updated_by_user_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_introduction_singleton" CHECK ("operations"."community_introduction"."id" = 1),
	CONSTRAINT "community_introduction_revision_nonnegative" CHECK ("operations"."community_introduction"."revision" >= 0),
	CONSTRAINT "community_introduction_published_content" CHECK (NOT "operations"."community_introduction"."published" OR (length(trim("operations"."community_introduction"."summary")) > 0 AND length(trim("operations"."community_introduction"."introduction")) > 0))
);
--> statement-breakpoint
ALTER TABLE "operations"."community_introduction" ADD CONSTRAINT "community_introduction_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;