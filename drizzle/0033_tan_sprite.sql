ALTER TABLE "recruiting"."kakao_bot_installations" ADD COLUMN "canonical_room_id" uuid;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "recruiting"."kakao_room_bindings"
		GROUP BY "installation_id"
		HAVING count(DISTINCT "room_id") > 1
	) THEN
		RAISE EXCEPTION 'KAKAO_INSTALLATION_MULTIPLE_ROOMS: resolve legacy bindings explicitly before 0033';
	END IF;
END $$;--> statement-breakpoint
UPDATE "recruiting"."kakao_bot_installations" AS "installation"
SET "canonical_room_id" = "legacy"."room_id"
FROM (
	SELECT "installation_id", min("room_id"::text)::uuid AS "room_id"
	FROM "recruiting"."kakao_room_bindings"
	GROUP BY "installation_id"
) AS "legacy"
WHERE "installation"."id" = "legacy"."installation_id"
	AND "installation"."canonical_room_id" IS NULL;--> statement-breakpoint
ALTER TABLE "recruiting"."kakao_bot_installations" ADD CONSTRAINT "kakao_bot_installations_canonical_room_id_kakao_rooms_id_fk" FOREIGN KEY ("canonical_room_id") REFERENCES "recruiting"."kakao_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kakao_bot_installations_room_idx" ON "recruiting"."kakao_bot_installations" USING btree ("canonical_room_id","status");
