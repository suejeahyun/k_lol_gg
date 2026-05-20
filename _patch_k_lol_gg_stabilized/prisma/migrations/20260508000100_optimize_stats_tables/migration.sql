ALTER TABLE "PlayerSeasonStat"
ADD COLUMN IF NOT EXISTS "participationCount" INTEGER NOT NULL DEFAULT 0;

DELETE FROM "PlayerSeasonStat" a
USING "PlayerSeasonStat" b
WHERE a.id > b.id
  AND a."playerId" = b."playerId"
  AND a."seasonId" = b."seasonId";

DELETE FROM "PlayerChampionStat" a
USING "PlayerChampionStat" b
WHERE a.id > b.id
  AND a."playerId" = b."playerId"
  AND a."championId" = b."championId";

DELETE FROM "PlayerPositionStat" a
USING "PlayerPositionStat" b
WHERE a.id > b.id
  AND a."playerId" = b."playerId"
  AND a."position" = b."position";

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerSeasonStat_playerId_seasonId_key" ON "PlayerSeasonStat"("playerId", "seasonId");
CREATE INDEX IF NOT EXISTS "PlayerSeasonStat_seasonId_totalGames_idx" ON "PlayerSeasonStat"("seasonId", "totalGames");
CREATE INDEX IF NOT EXISTS "PlayerSeasonStat_seasonId_wins_idx" ON "PlayerSeasonStat"("seasonId", "wins");
CREATE INDEX IF NOT EXISTS "PlayerSeasonStat_seasonId_mvpCount_idx" ON "PlayerSeasonStat"("seasonId", "mvpCount");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerChampionStat_playerId_championId_key" ON "PlayerChampionStat"("playerId", "championId");
CREATE INDEX IF NOT EXISTS "PlayerChampionStat_championId_idx" ON "PlayerChampionStat"("championId");
CREATE INDEX IF NOT EXISTS "PlayerChampionStat_playerId_games_idx" ON "PlayerChampionStat"("playerId", "games");
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPositionStat_playerId_position_key" ON "PlayerPositionStat"("playerId", "position");
CREATE INDEX IF NOT EXISTS "PlayerPositionStat_playerId_games_idx" ON "PlayerPositionStat"("playerId", "games");
