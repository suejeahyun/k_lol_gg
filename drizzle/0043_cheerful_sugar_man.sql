CREATE TABLE "team_tools"."team_balance_player_overrides" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reason" varchar(300) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_by_user_account_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_balance_override_score_range" CHECK ("team_tools"."team_balance_player_overrides"."score" BETWEEN -1000 AND 1000),
	CONSTRAINT "team_balance_override_revision_nonnegative" CHECK ("team_tools"."team_balance_player_overrides"."revision" >= 0),
	CONSTRAINT "team_balance_override_reason_length" CHECK (char_length(btrim("team_tools"."team_balance_player_overrides"."reason")) BETWEEN 3 AND 300)
);
--> statement-breakpoint
ALTER TABLE "riot"."summaries" ADD COLUMN "recent_solo_json" jsonb;--> statement-breakpoint
ALTER TABLE "riot"."summaries" ADD COLUMN "recent_solo_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_player_overrides" ADD CONSTRAINT "team_balance_player_overrides_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "registry"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tools"."team_balance_player_overrides" ADD CONSTRAINT "team_balance_player_overrides_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot"."summaries" ADD CONSTRAINT "riot_summaries_recent_solo_pair" CHECK (("riot"."summaries"."recent_solo_json" IS NULL AND "riot"."summaries"."recent_solo_synced_at" IS NULL) OR (jsonb_typeof("riot"."summaries"."recent_solo_json") = 'object' AND "riot"."summaries"."recent_solo_synced_at" IS NOT NULL));