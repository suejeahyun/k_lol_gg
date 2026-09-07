CREATE SCHEMA "media";
--> statement-breakpoint
CREATE TYPE "media"."publication_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
--> statement-breakpoint
CREATE TYPE "media"."outbox_status" AS ENUM('PENDING', 'DELIVERED');
--> statement-breakpoint
CREATE TABLE "media"."highlights" (
  "id" uuid PRIMARY KEY NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "title" varchar(120) NOT NULL,
  "description" varchar(4000) NOT NULL,
  "youtube_id" varchar(11) NOT NULL,
  "thumbnail_asset_id" uuid,
  "status" "media"."publication_status" DEFAULT 'DRAFT' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by_user_account_id" uuid NOT NULL,
  "updated_by_user_account_id" uuid NOT NULL,
  "published_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_highlights_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "media_highlights_title_nonempty" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "media_highlights_description_nonempty" CHECK (char_length(btrim("description")) BETWEEN 1 AND 4000),
  CONSTRAINT "media_highlights_youtube_id" CHECK ("youtube_id" ~ '^[A-Za-z0-9_-]{11}$'),
  CONSTRAINT "media_highlights_sort_order" CHECK ("sort_order" BETWEEN -100000 AND 100000),
  CONSTRAINT "media_highlights_lifecycle" CHECK ((("status" = 'DRAFT' AND "published_at" IS NULL AND "archived_at" IS NULL) OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "archived_at" IS NULL) OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "media"."galleries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "revision" bigint DEFAULT 0 NOT NULL,
  "title" varchar(120) NOT NULL,
  "description" varchar(4000) NOT NULL,
  "show_on_home" boolean DEFAULT false NOT NULL,
  "status" "media"."publication_status" DEFAULT 'DRAFT' NOT NULL,
  "created_by_user_account_id" uuid NOT NULL,
  "updated_by_user_account_id" uuid NOT NULL,
  "published_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_galleries_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "media_galleries_title_nonempty" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "media_galleries_description_nonempty" CHECK (char_length(btrim("description")) BETWEEN 1 AND 4000),
  CONSTRAINT "media_galleries_home_published" CHECK ("show_on_home" = false OR "status" = 'PUBLISHED'),
  CONSTRAINT "media_galleries_lifecycle" CHECK ((("status" = 'DRAFT' AND "published_at" IS NULL AND "archived_at" IS NULL) OR ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL AND "archived_at" IS NULL) OR ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "media"."gallery_assets" (
  "gallery_id" uuid NOT NULL,
  "private_asset_id" uuid NOT NULL,
  "ordinal" integer NOT NULL,
  CONSTRAINT "media_gallery_assets_gallery_id_private_asset_id_pk" PRIMARY KEY("gallery_id", "private_asset_id"),
  CONSTRAINT "media_gallery_assets_ordinal" CHECK ("ordinal" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "media"."command_receipts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "actor_user_account_id" uuid NOT NULL,
  "scope" varchar(128) NOT NULL,
  "key_hash" bytea NOT NULL,
  "request_hash" bytea NOT NULL,
  "response_status" integer NOT NULL,
  "response_json" jsonb NOT NULL,
  "response_etag" varchar(32),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "media_receipts_key_hash" CHECK (octet_length("key_hash") = 32),
  CONSTRAINT "media_receipts_request_hash" CHECK (octet_length("request_hash") = 32),
  CONSTRAINT "media_receipts_success" CHECK ("response_status" BETWEEN 200 AND 299),
  CONSTRAINT "media_receipts_expiry" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "media"."outbox" (
  "id" uuid PRIMARY KEY NOT NULL,
  "aggregate_type" varchar(32) NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "aggregate_revision" bigint NOT NULL,
  "request_id" uuid NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "payload_json" jsonb NOT NULL,
  "status" "media"."outbox_status" DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  CONSTRAINT "media_outbox_revision_nonnegative" CHECK ("aggregate_revision" >= 0),
  CONSTRAINT "media_outbox_aggregate_type" CHECK ("aggregate_type" IN ('HIGHLIGHT', 'GALLERY')),
  CONSTRAINT "media_outbox_payload_object" CHECK (jsonb_typeof("payload_json") = 'object'),
  CONSTRAINT "media_outbox_delivery" CHECK (("status" = 'PENDING' AND "delivered_at" IS NULL) OR ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD CONSTRAINT "media_highlights_thumbnail_asset_id_private_assets_id_fk" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD CONSTRAINT "media_highlights_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."highlights" ADD CONSTRAINT "media_highlights_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."galleries" ADD CONSTRAINT "media_galleries_created_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("created_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."galleries" ADD CONSTRAINT "media_galleries_updated_by_user_account_id_user_accounts_id_fk" FOREIGN KEY ("updated_by_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."gallery_assets" ADD CONSTRAINT "media_gallery_assets_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "media"."galleries"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."gallery_assets" ADD CONSTRAINT "media_gallery_assets_private_asset_id_private_assets_id_fk" FOREIGN KEY ("private_asset_id") REFERENCES "assets"."private_assets"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "media"."command_receipts" ADD CONSTRAINT "media_command_receipts_actor_user_account_id_user_accounts_id_fk" FOREIGN KEY ("actor_user_account_id") REFERENCES "auth"."user_accounts"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "media_highlights_public_idx" ON "media"."highlights" ("status", "sort_order", "id");
--> statement-breakpoint
CREATE INDEX "media_highlights_updated_idx" ON "media"."highlights" ("updated_at" DESC, "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_highlights_thumbnail_asset_uidx" ON "media"."highlights" ("thumbnail_asset_id") WHERE "thumbnail_asset_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "media_galleries_public_idx" ON "media"."galleries" ("status", "published_at" DESC, "id");
--> statement-breakpoint
CREATE INDEX "media_galleries_updated_idx" ON "media"."galleries" ("updated_at" DESC, "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_gallery_assets_gallery_ordinal_uidx" ON "media"."gallery_assets" ("gallery_id", "ordinal");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_gallery_assets_asset_uidx" ON "media"."gallery_assets" ("private_asset_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_receipts_actor_scope_key_uidx" ON "media"."command_receipts" ("actor_user_account_id", "scope", "key_hash");
--> statement-breakpoint
CREATE INDEX "media_receipts_expires_idx" ON "media"."command_receipts" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_outbox_request_event_uidx" ON "media"."outbox" ("request_id", "event_type");
--> statement-breakpoint
CREATE INDEX "media_outbox_pending_idx" ON "media"."outbox" ("created_at", "id") WHERE "status" = 'PENDING';
--> statement-breakpoint
CREATE FUNCTION "media"."assert_highlight_publication"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'PUBLISHED' AND NEW."thumbnail_asset_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "assets"."private_assets" pa
     WHERE pa."id" = NEW."thumbnail_asset_id" AND pa."status" = 'READY' AND pa."purpose" = 'HIGHLIGHT_THUMBNAIL'
  ) THEN
    RAISE EXCEPTION 'published highlight thumbnail must be READY HIGHLIGHT_THUMBNAIL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "media_highlights_public_asset_guard"
AFTER INSERT OR UPDATE OF "status", "thumbnail_asset_id" ON "media"."highlights"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "media"."assert_highlight_publication"();
--> statement-breakpoint
CREATE FUNCTION "media"."assert_gallery_publication"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
DECLARE publication "media"."publication_status";
DECLARE asset_count integer;
BEGIN
  IF TG_TABLE_NAME = 'galleries' THEN
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."gallery_id" ELSE NEW."gallery_id" END;
  END IF;
  SELECT g."status" INTO publication FROM "media"."galleries" g WHERE g."id" = target_id;
  IF publication = 'PUBLISHED' THEN
    SELECT count(*) INTO asset_count FROM "media"."gallery_assets" ga WHERE ga."gallery_id" = target_id;
    IF asset_count NOT BETWEEN 1 AND 5 OR EXISTS (
      SELECT 1 FROM "media"."gallery_assets" ga
      LEFT JOIN "assets"."private_assets" pa ON pa."id" = ga."private_asset_id"
      WHERE ga."gallery_id" = target_id AND (pa."id" IS NULL OR pa."status" <> 'READY' OR pa."purpose" <> 'GALLERY')
    ) THEN
      RAISE EXCEPTION 'published gallery assets must be 1-5 READY GALLERY assets' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "media_galleries_public_asset_guard"
AFTER INSERT OR UPDATE OF "status" ON "media"."galleries"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "media"."assert_gallery_publication"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "media_gallery_assets_public_guard"
AFTER INSERT OR UPDATE OR DELETE ON "media"."gallery_assets"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "media"."assert_gallery_publication"();
--> statement-breakpoint
CREATE FUNCTION "media"."protect_published_private_asset"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."status" <> 'READY' OR NEW."purpose" <> OLD."purpose") AND (
    EXISTS (SELECT 1 FROM "media"."highlights" h WHERE h."thumbnail_asset_id" = NEW."id" AND h."status" = 'PUBLISHED')
    OR EXISTS (
      SELECT 1 FROM "media"."gallery_assets" ga JOIN "media"."galleries" g ON g."id" = ga."gallery_id"
       WHERE ga."private_asset_id" = NEW."id" AND g."status" = 'PUBLISHED'
    )
  ) THEN
    RAISE EXCEPTION 'published media asset must remain READY with its original purpose' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "media_published_private_asset_guard"
AFTER UPDATE OF "status", "purpose" ON "assets"."private_assets"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "media"."protect_published_private_asset"();
