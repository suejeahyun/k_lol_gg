DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "riot"."account_links"
    WHERE "status" = 'CONNECTED'
    GROUP BY "normalized_key"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add riot_links_connected_normalized_key_uidx: duplicate CONNECTED normalized_key rows exist; resolve them explicitly before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "riot"."account_links"
    WHERE "status" = 'CONNECTED'
    GROUP BY "owner_user_account_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add riot_links_connected_owner_uidx: duplicate CONNECTED owner_user_account_id rows exist; resolve them explicitly before retrying.';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "riot_links_connected_normalized_key_uidx" ON "riot"."account_links" USING btree ("normalized_key") WHERE "riot"."account_links"."status" = 'CONNECTED';--> statement-breakpoint
CREATE UNIQUE INDEX "riot_links_connected_owner_uidx" ON "riot"."account_links" USING btree ("owner_user_account_id") WHERE "riot"."account_links"."status" = 'CONNECTED';
