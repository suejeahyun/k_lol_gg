CREATE TABLE IF NOT EXISTS "AppDataCache" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppDataCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "AppDataCache_updatedAt_idx" ON "AppDataCache"("updatedAt");

CREATE INDEX IF NOT EXISTS "PlayerSeasonStat_seasonId_participationCount_idx" ON "PlayerSeasonStat"("seasonId", "participationCount");
CREATE INDEX IF NOT EXISTS "PlayerSeasonStat_seasonId_totalGames_participationCount_idx" ON "PlayerSeasonStat"("seasonId", "totalGames", "participationCount");
CREATE INDEX IF NOT EXISTS "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");
CREATE INDEX IF NOT EXISTS "RecruitParty_status_updatedAt_idx" ON "RecruitParty"("status", "updatedAt");
