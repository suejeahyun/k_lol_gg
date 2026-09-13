CREATE TYPE "competition"."season_inhouse_round_status" AS ENUM('DRAFT', 'IN_PROGRESS', 'CANCELED');--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" DROP CONSTRAINT "scrim_recruits_tournament_identity";--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" DROP CONSTRAINT "scrim_recruits_requester_identity";--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD COLUMN "status" "competition"."season_inhouse_round_status" DEFAULT 'IN_PROGRESS' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD COLUMN "game_info" varchar(500);--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD COLUMN "organizer_text" varchar(100);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "organizer_text" varchar(100);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD CONSTRAINT "season_inhouse_rounds_game_info_length" CHECK ("competition"."season_inhouse_rounds"."game_info" IS NULL OR char_length(btrim("competition"."season_inhouse_rounds"."game_info")) BETWEEN 1 AND 500);--> statement-breakpoint
ALTER TABLE "competition"."season_inhouse_rounds" ADD CONSTRAINT "season_inhouse_rounds_organizer_length" CHECK ("competition"."season_inhouse_rounds"."organizer_text" IS NULL OR char_length(btrim("competition"."season_inhouse_rounds"."organizer_text")) BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_organizer_text" CHECK ("recruiting"."scrims"."organizer_text" IS NULL OR char_length(btrim("recruiting"."scrims"."organizer_text")) BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_tournament_identity" CHECK ("recruiting"."scrims"."is_draft" OR "recruiting"."scrims"."tournament_id" IS NOT NULL OR ("recruiting"."scrims"."legacy_tournament_number" IS NOT NULL AND "recruiting"."scrims"."legacy_tournament_number" BETWEEN 1 AND 9999));--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_requester_identity" CHECK ("recruiting"."scrims"."is_draft" OR "recruiting"."scrims"."requester_team_id" IS NOT NULL OR ("recruiting"."scrims"."requester_team_name" IS NOT NULL AND char_length(btrim("recruiting"."scrims"."requester_team_name")) BETWEEN 1 AND 120));
