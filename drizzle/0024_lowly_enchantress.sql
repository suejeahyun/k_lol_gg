ALTER TABLE "recruiting"."scrims" DROP CONSTRAINT "scrim_recruits_best_of";--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ALTER COLUMN "requester_team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ALTER COLUMN "best_of" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "legacy_title" varchar(160);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "requester_team_name" varchar(120);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD COLUMN "opponent_team_name" varchar(120);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_requester_identity" CHECK ("recruiting"."scrims"."requester_team_id" IS NOT NULL OR char_length(btrim("recruiting"."scrims"."requester_team_name")) BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_legacy_title" CHECK ("recruiting"."scrims"."legacy_title" IS NULL OR char_length(btrim("recruiting"."scrims"."legacy_title")) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_requester_name" CHECK ("recruiting"."scrims"."requester_team_name" IS NULL OR char_length(btrim("recruiting"."scrims"."requester_team_name")) BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_opponent_name" CHECK ("recruiting"."scrims"."opponent_team_name" IS NULL OR char_length(btrim("recruiting"."scrims"."opponent_team_name")) BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "recruiting"."scrims" ADD CONSTRAINT "scrim_recruits_best_of" CHECK ("recruiting"."scrims"."best_of" IS NULL OR "recruiting"."scrims"."best_of" IN (1, 3, 5));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "media"."assert_gallery_publication"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
DECLARE publication "media"."publication_status";
DECLARE image_count integer;
BEGIN
  IF TG_TABLE_NAME = 'galleries' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."gallery_id" ELSE NEW."gallery_id" END;
  END IF;
  SELECT g."status" INTO publication FROM "media"."galleries" g WHERE g."id" = target_id;
  IF publication = 'PUBLISHED' THEN
    SELECT
      (SELECT count(*) FROM "media"."gallery_assets" ga WHERE ga."gallery_id" = target_id) +
      (SELECT count(*) FROM "media"."gallery_external_images" gei WHERE gei."gallery_id" = target_id)
      INTO image_count;
    IF image_count NOT BETWEEN 1 AND 5 OR EXISTS (
      SELECT 1 FROM "media"."gallery_assets" ga
      LEFT JOIN "assets"."private_assets" pa ON pa."id" = ga."private_asset_id"
      WHERE ga."gallery_id" = target_id AND (pa."id" IS NULL OR pa."status" <> 'READY' OR pa."purpose" <> 'GALLERY')
    ) THEN
      RAISE EXCEPTION 'published gallery images must total 1-5 and uploaded assets must be READY GALLERY assets' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "media_gallery_external_images_public_guard" ON "media"."gallery_external_images";
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "media_gallery_external_images_public_guard"
AFTER INSERT OR UPDATE OR DELETE ON "media"."gallery_external_images"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "media"."assert_gallery_publication"();
