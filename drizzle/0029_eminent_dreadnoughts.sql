ALTER TABLE "recruiting"."parties" ADD COLUMN "start_time_text" varchar(160) DEFAULT '미정' NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD COLUMN "game_info" varchar(500) DEFAULT '미입력' NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_start_time_text" CHECK (char_length(btrim("recruiting"."parties"."start_time_text")) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "recruiting"."parties" ADD CONSTRAINT "recruit_parties_game_info" CHECK (char_length(btrim("recruiting"."parties"."game_info")) BETWEEN 1 AND 500);