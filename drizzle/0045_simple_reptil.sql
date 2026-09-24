CREATE TABLE "riot"."analytics_progress" (
	"link_id" uuid PRIMARY KEY NOT NULL,
	"link_revision" bigint NOT NULL,
	"history_before" bigint,
	"history_complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "riot_analytics_revision_nonnegative" CHECK ("riot"."analytics_progress"."link_revision" >= 0),
	CONSTRAINT "riot_analytics_history_before" CHECK ("riot"."analytics_progress"."history_before" IS NULL OR "riot"."analytics_progress"."history_before" >= 0)
);
--> statement-breakpoint
CREATE TABLE "riot"."match_archive" (
	"link_id" uuid NOT NULL,
	"link_revision" bigint NOT NULL,
	"match_id" varchar(40) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"match_json" jsonb NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_archive_link_id_link_revision_match_id_pk" PRIMARY KEY("link_id","link_revision","match_id"),
	CONSTRAINT "riot_archive_revision_nonnegative" CHECK ("riot"."match_archive"."link_revision" >= 0),
	CONSTRAINT "riot_archive_match_id" CHECK ("riot"."match_archive"."match_id" ~ '^[A-Z0-9]{2,8}_[0-9]{1,20}$'),
	CONSTRAINT "riot_archive_match_object" CHECK (jsonb_typeof("riot"."match_archive"."match_json") = 'object')
);
--> statement-breakpoint
CREATE TABLE "riot"."rank_history" (
	"link_id" uuid NOT NULL,
	"link_revision" bigint NOT NULL,
	"day" varchar(10) NOT NULL,
	"tier" varchar(16),
	"rank" varchar(8),
	"league_points" integer,
	"wins" integer,
	"losses" integer,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rank_history_link_id_link_revision_day_pk" PRIMARY KEY("link_id","link_revision","day"),
	CONSTRAINT "riot_rank_history_revision_nonnegative" CHECK ("riot"."rank_history"."link_revision" >= 0),
	CONSTRAINT "riot_rank_history_day" CHECK ("riot"."rank_history"."day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "riot_rank_history_counts" CHECK (("riot"."rank_history"."league_points" IS NULL OR "riot"."rank_history"."league_points" >= 0) AND ("riot"."rank_history"."wins" IS NULL OR "riot"."rank_history"."wins" >= 0) AND ("riot"."rank_history"."losses" IS NULL OR "riot"."rank_history"."losses" >= 0))
);
--> statement-breakpoint
ALTER TABLE "riot"."analytics_progress" ADD CONSTRAINT "analytics_progress_link_id_account_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "riot"."account_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."match_archive" ADD CONSTRAINT "match_archive_link_id_account_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "riot"."account_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."rank_history" ADD CONSTRAINT "rank_history_link_id_account_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "riot"."account_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "riot_archive_page_idx" ON "riot"."match_archive" USING btree ("link_id","link_revision","started_at" DESC NULLS LAST,"match_id" DESC NULLS LAST);