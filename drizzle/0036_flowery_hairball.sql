DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "riot"."account_links" link
    LEFT JOIN "registry"."players" player
      ON player."id" = link."player_id"
      AND player."user_account_id" = link."owner_user_account_id"
    WHERE player."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add riot_links_player_owner_fk: account_links player_id and owner_user_account_id do not match registry.players; resolve mismatches explicitly before retrying.';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "players_id_user_account_uidx" ON "registry"."players" USING btree ("id","user_account_id");--> statement-breakpoint
ALTER TABLE "riot"."account_links" ADD CONSTRAINT "riot_links_player_owner_fk" FOREIGN KEY ("player_id","owner_user_account_id") REFERENCES "registry"."players"("id","user_account_id") ON DELETE restrict ON UPDATE no action;
