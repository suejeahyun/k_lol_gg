ALTER TABLE "recruiting"."parties" DROP CONSTRAINT "recruit_parties_members_array";--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ALTER COLUMN "tournament_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD COLUMN "source_room_id" varchar(128);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "source_room_id" varchar(128);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "legacy_tournament_number" integer;--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "requester_lineup_json" jsonb;--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "opponent_lineup_json" jsonb;--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "legacy_memo" varchar(500);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "legacy_series_rule_text" varchar(160);--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_primary_capacity" CHECK (jsonb_array_length(jsonb_path_query_array("recruiting"."parties"."members_json", '$[*] ? (@.substitute == false)')) <= "recruiting"."parties"."maximum_members");--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_source_room" CHECK ("recruiting"."parties"."source_room_id" IS NULL OR char_length(btrim("recruiting"."parties"."source_room_id")) BETWEEN 1 AND 128);--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_members_array" CHECK (jsonb_typeof("recruiting"."parties"."members_json") = 'array' AND jsonb_array_length("recruiting"."parties"."members_json") <= 99);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_tournament_identity" CHECK ("recruiting"."scrims"."tournament_id" IS NOT NULL OR "recruiting"."scrims"."legacy_tournament_number" BETWEEN 1 AND 9999);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_legacy_tournament_number" CHECK ("recruiting"."scrims"."legacy_tournament_number" IS NULL OR "recruiting"."scrims"."legacy_tournament_number" BETWEEN 1 AND 9999);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_requester_lineup" CHECK ("recruiting"."scrims"."requester_lineup_json" IS NULL OR jsonb_typeof("recruiting"."scrims"."requester_lineup_json") = 'object');--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_opponent_lineup" CHECK ("recruiting"."scrims"."opponent_lineup_json" IS NULL OR jsonb_typeof("recruiting"."scrims"."opponent_lineup_json") = 'object');--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_legacy_memo" CHECK ("recruiting"."scrims"."legacy_memo" IS NULL OR char_length(btrim("recruiting"."scrims"."legacy_memo")) BETWEEN 1 AND 500);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_legacy_series_rule" CHECK ("recruiting"."scrims"."legacy_series_rule_text" IS NULL OR char_length(btrim("recruiting"."scrims"."legacy_series_rule_text")) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_source_room" CHECK ("recruiting"."scrims"."source_room_id" IS NULL OR char_length(btrim("recruiting"."scrims"."source_room_id")) BETWEEN 1 AND 128);