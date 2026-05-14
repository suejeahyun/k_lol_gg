-- Long-term operation improvements
-- 1. Player soft-delete support
ALTER TABLE "Player"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Player"
ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Player_isActive_idx" ON "Player"("isActive");

-- 2. Remove unused avgGold column after CS/Gold removal
ALTER TABLE "PlayerSeasonStat"
DROP COLUMN IF EXISTS "avgGold";

-- 3. Season-scoped champion stats
ALTER TABLE "PlayerChampionStat"
ADD COLUMN IF NOT EXISTS "seasonId" INTEGER;

UPDATE "PlayerChampionStat"
SET "seasonId" = COALESCE(
  (SELECT id FROM "Season" WHERE "isActive" = true ORDER BY id DESC LIMIT 1),
  (SELECT id FROM "Season" ORDER BY id DESC LIMIT 1)
)
WHERE "seasonId" IS NULL;

DELETE FROM "PlayerChampionStat"
WHERE "seasonId" IS NULL;

DELETE FROM "PlayerChampionStat" a
USING "PlayerChampionStat" b
WHERE a.id > b.id
  AND a."playerId" = b."playerId"
  AND a."seasonId" = b."seasonId"
  AND a."championId" = b."championId";

DROP INDEX IF EXISTS "PlayerChampionStat_playerId_championId_key";
DROP INDEX IF EXISTS "PlayerChampionStat_playerId_games_idx";

ALTER TABLE "PlayerChampionStat"
ALTER COLUMN "seasonId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlayerChampionStat_seasonId_fkey'
  ) THEN
    ALTER TABLE "PlayerChampionStat"
    ADD CONSTRAINT "PlayerChampionStat_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerChampionStat_playerId_seasonId_championId_key"
ON "PlayerChampionStat"("playerId", "seasonId", "championId");

CREATE INDEX IF NOT EXISTS "PlayerChampionStat_seasonId_idx" ON "PlayerChampionStat"("seasonId");
CREATE INDEX IF NOT EXISTS "PlayerChampionStat_playerId_seasonId_games_idx" ON "PlayerChampionStat"("playerId", "seasonId", "games");

-- 4. Season-scoped position stats
ALTER TABLE "PlayerPositionStat"
ADD COLUMN IF NOT EXISTS "seasonId" INTEGER;

UPDATE "PlayerPositionStat"
SET "seasonId" = COALESCE(
  (SELECT id FROM "Season" WHERE "isActive" = true ORDER BY id DESC LIMIT 1),
  (SELECT id FROM "Season" ORDER BY id DESC LIMIT 1)
)
WHERE "seasonId" IS NULL;

DELETE FROM "PlayerPositionStat"
WHERE "seasonId" IS NULL;

DELETE FROM "PlayerPositionStat" a
USING "PlayerPositionStat" b
WHERE a.id > b.id
  AND a."playerId" = b."playerId"
  AND a."seasonId" = b."seasonId"
  AND a."position" = b."position";

DROP INDEX IF EXISTS "PlayerPositionStat_playerId_position_key";
DROP INDEX IF EXISTS "PlayerPositionStat_playerId_games_idx";

ALTER TABLE "PlayerPositionStat"
ALTER COLUMN "seasonId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PlayerPositionStat_seasonId_fkey'
  ) THEN
    ALTER TABLE "PlayerPositionStat"
    ADD CONSTRAINT "PlayerPositionStat_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPositionStat_playerId_seasonId_position_key"
ON "PlayerPositionStat"("playerId", "seasonId", "position");

CREATE INDEX IF NOT EXISTS "PlayerPositionStat_seasonId_idx" ON "PlayerPositionStat"("seasonId");
CREATE INDEX IF NOT EXISTS "PlayerPositionStat_playerId_seasonId_games_idx" ON "PlayerPositionStat"("playerId", "seasonId", "games");

-- 5. Only one active season at DB level
UPDATE "Season" a
SET "isActive" = false
FROM "Season" b
WHERE a.id < b.id
  AND a."isActive" = true
  AND b."isActive" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "Season_one_active_season_key"
ON "Season"("isActive")
WHERE "isActive" = true;

-- 6. DB-backed rate limit log
CREATE TABLE IF NOT EXISTS "RateLimitLog" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RateLimitLog_key_action_createdAt_idx"
ON "RateLimitLog"("key", "action", "createdAt");
