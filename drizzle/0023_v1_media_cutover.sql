CREATE TABLE "media"."gallery_external_images" (
	"gallery_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"source_url" varchar(2048) NOT NULL,
	CONSTRAINT "gallery_external_images_gallery_id_ordinal_pk" PRIMARY KEY("gallery_id","ordinal"),
	CONSTRAINT "media_gallery_external_images_ordinal" CHECK ("media"."gallery_external_images"."ordinal" BETWEEN 0 AND 4),
	CONSTRAINT "media_gallery_external_images_source_url" CHECK (
      char_length("media"."gallery_external_images"."source_url") BETWEEN 1 AND 2048
      AND "media"."gallery_external_images"."source_url" !~ '[[:cntrl:]]'
      AND ("media"."gallery_external_images"."source_url" ~ '^https://' OR "media"."gallery_external_images"."source_url" ~ '^/images/')
    )
);
--> statement-breakpoint
ALTER TABLE "media"."galleries" ADD COLUMN "legacy_id" bigint;--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD COLUMN "legacy_id" bigint;--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD COLUMN "legacy_thumbnail_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "competition"."event_competitions" ADD COLUMN "gallery_id" uuid;--> statement-breakpoint
ALTER TABLE "media"."gallery_external_images" ADD CONSTRAINT "gallery_external_images_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "media"."galleries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_gallery_external_images_gallery_url_uidx" ON "media"."gallery_external_images" USING btree ("gallery_id","source_url");--> statement-breakpoint
ALTER TABLE "competition"."event_competitions" ADD CONSTRAINT "event_competitions_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "media"."galleries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_galleries_legacy_id_uidx" ON "media"."galleries" USING btree ("legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_highlights_legacy_id_uidx" ON "media"."highlights" USING btree ("legacy_id");--> statement-breakpoint
ALTER TABLE "media"."galleries" ADD CONSTRAINT "media_galleries_legacy_id_positive" CHECK ("media"."galleries"."legacy_id" IS NULL OR "media"."galleries"."legacy_id" > 0);--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD CONSTRAINT "media_highlights_legacy_id_positive" CHECK ("media"."highlights"."legacy_id" IS NULL OR "media"."highlights"."legacy_id" > 0);--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD CONSTRAINT "media_highlights_legacy_thumbnail_url" CHECK ("media"."highlights"."legacy_thumbnail_url" IS NULL OR (
      char_length("media"."highlights"."legacy_thumbnail_url") BETWEEN 1 AND 2048
      AND "media"."highlights"."legacy_thumbnail_url" !~ '[[:cntrl:]]'
      AND ("media"."highlights"."legacy_thumbnail_url" ~ '^https://' OR "media"."highlights"."legacy_thumbnail_url" ~ '^/images/')
    ));
