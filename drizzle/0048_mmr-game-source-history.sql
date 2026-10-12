CREATE TABLE "mmr"."match_game_sources" (
	"generation" bigint NOT NULL,
	"game_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"source_kind" varchar(32) NOT NULL,
	"source_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_game_sources_generation_game_id_pk" PRIMARY KEY("generation","game_id"),
	CONSTRAINT "mmr_game_sources_generation_positive" CHECK ("mmr"."match_game_sources"."generation" > 0),
	CONSTRAINT "mmr_game_sources_number_range" CHECK ("mmr"."match_game_sources"."game_number" BETWEEN 1 AND 9),
	CONSTRAINT "mmr_game_sources_provenance" CHECK ((
      ("mmr"."match_game_sources"."source_kind" = 'LEGACY_EVENT_REFERENCE' AND "mmr"."match_game_sources"."source_json" IS NULL)
      OR ("mmr"."match_game_sources"."source_kind" = 'LEDGER_SNAPSHOT' AND "mmr"."match_game_sources"."source_json" IS NOT NULL AND jsonb_typeof("mmr"."match_game_sources"."source_json") = 'object')
    ))
);
--> statement-breakpoint
-- Existing events identify their original game, but the old schema did not
-- retain historical KDA. Preserve only facts present in the event ledger.
INSERT INTO "mmr"."match_game_sources" (
  "generation", "game_id", "match_id", "game_number", "source_kind", "source_json", "created_at"
)
SELECT "generation", "game_id", "match_id", "game_number", 'LEGACY_EVENT_REFERENCE', NULL, min("created_at")
FROM "mmr"."match_result_events"
GROUP BY "generation", "game_id", "match_id", "game_number";
--> statement-breakpoint
ALTER TABLE "mmr"."match_game_sources" ADD CONSTRAINT "match_game_sources_match_id_match_series_id_fk" FOREIGN KEY ("match_id") REFERENCES "competition"."match_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" ADD CONSTRAINT "mmr_match_events_generation_game_source_fk" FOREIGN KEY ("generation","game_id") REFERENCES "mmr"."match_game_sources"("generation","game_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mmr"."match_result_events" DROP CONSTRAINT "match_result_events_game_id_match_games_id_fk";
--> statement-breakpoint
-- Rolling deployment/rollback compatibility: the previous writer knows only
-- event rows. It may add an identity reference, never fabricate a KDA snapshot
-- or overwrite the exact source inserted by the new writer.
CREATE FUNCTION "mmr"."ensure_match_game_source_reference"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "mmr"."match_game_sources" (
    "generation", "game_id", "match_id", "game_number", "source_kind", "source_json", "created_at"
  ) VALUES (
    NEW."generation", NEW."game_id", NEW."match_id", NEW."game_number", 'LEGACY_EVENT_REFERENCE', NULL, NEW."created_at"
  ) ON CONFLICT ("generation", "game_id") DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "mmr_match_events_legacy_source_reference"
BEFORE INSERT ON "mmr"."match_result_events"
FOR EACH ROW EXECUTE FUNCTION "mmr"."ensure_match_game_source_reference"();
