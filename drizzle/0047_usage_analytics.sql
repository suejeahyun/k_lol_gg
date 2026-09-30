CREATE SCHEMA "usage";
--> statement-breakpoint
CREATE TABLE "usage"."collection" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"first_event_at" timestamp with time zone,
	"bucket_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bucket_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_singleton" CHECK ("usage"."collection"."singleton" = true)
);
--> statement-breakpoint
CREATE TABLE "usage"."events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"user_account_id" uuid,
	"kind" varchar(8) NOT NULL,
	"route" varchar(80) NOT NULL,
	"target" varchar(80),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_event_kind" CHECK ("usage"."events"."kind" in ('page', 'click', 'search'))
);
--> statement-breakpoint
CREATE TABLE "usage"."visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"user_account_id" uuid,
	"last_seen_at" timestamp with time zone NOT NULL,
	"bucket_at" timestamp with time zone NOT NULL,
	"bucket_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage"."events" ADD CONSTRAINT "events_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage"."visitors" ADD CONSTRAINT "visitors_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_time_idx" ON "usage"."events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_member_time_idx" ON "usage"."events" USING btree ("user_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_visitors_seen_idx" ON "usage"."visitors" USING btree ("last_seen_at");
--> statement-breakpoint
INSERT INTO "usage"."collection" ("singleton") VALUES (true);
