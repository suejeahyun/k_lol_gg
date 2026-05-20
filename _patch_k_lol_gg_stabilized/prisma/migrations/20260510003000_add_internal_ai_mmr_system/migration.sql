-- Internal AI/MMR balance system
CREATE TABLE IF NOT EXISTS "PlayerBalanceProfile" (
  "id" SERIAL PRIMARY KEY,
  "playerId" INTEGER NOT NULL UNIQUE,
  "overallMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "topMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "jungleMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "midMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "adcMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "supportMmr" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "matchesAnalyzed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerBalanceProfile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlayerBalanceProfile_overallMmr_idx" ON "PlayerBalanceProfile"("overallMmr");
CREATE INDEX IF NOT EXISTS "PlayerBalanceProfile_confidence_idx" ON "PlayerBalanceProfile"("confidence");

CREATE TABLE IF NOT EXISTS "BalanceMatchReview" (
  "id" SERIAL PRIMARY KEY,
  "matchSeriesId" INTEGER NOT NULL,
  "draftId" INTEGER,
  "selectedOptionType" TEXT,
  "predictedRedWinRate" DOUBLE PRECISION,
  "predictedBlueWinRate" DOUBLE PRECISION,
  "actualWinner" "Team",
  "redTotal" DOUBLE PRECISION,
  "blueTotal" DOUBLE PRECISION,
  "diff" DOUBLE PRECISION,
  "maxLineDiff" DOUBLE PRECISION,
  "midJglDiff" DOUBLE PRECISION,
  "bottomDiff" DOUBLE PRECISION,
  "autoCount" INTEGER,
  "highTierOffRoleCount" INTEGER,
  "qualityScore" DOUBLE PRECISION,
  "feedbackRating" TEXT,
  "feedbackProblemTeam" "Team",
  "feedbackProblemLine" "Position",
  "feedbackMemo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BalanceMatchReview_matchSeriesId_fkey" FOREIGN KEY ("matchSeriesId") REFERENCES "MatchSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BalanceMatchReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TeamBalanceDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BalanceMatchReview_matchSeriesId_idx" ON "BalanceMatchReview"("matchSeriesId");
CREATE INDEX IF NOT EXISTS "BalanceMatchReview_draftId_idx" ON "BalanceMatchReview"("draftId");
CREATE INDEX IF NOT EXISTS "BalanceMatchReview_actualWinner_idx" ON "BalanceMatchReview"("actualWinner");

CREATE TABLE IF NOT EXISTS "PlayerBalanceMatchResult" (
  "id" SERIAL PRIMARY KEY,
  "matchSeriesId" INTEGER NOT NULL,
  "gameId" INTEGER,
  "playerId" INTEGER NOT NULL,
  "championId" INTEGER,
  "team" "Team" NOT NULL,
  "position" "Position" NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "win" BOOLEAN NOT NULL DEFAULT false,
  "expectedScoreBefore" DOUBLE PRECISION,
  "actualPerformanceScore" DOUBLE PRECISION,
  "mmrDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "positionMmrDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerBalanceMatchResult_matchSeriesId_fkey" FOREIGN KEY ("matchSeriesId") REFERENCES "MatchSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerBalanceMatchResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PlayerBalanceMatchResult_matchSeriesId_idx" ON "PlayerBalanceMatchResult"("matchSeriesId");
CREATE INDEX IF NOT EXISTS "PlayerBalanceMatchResult_playerId_idx" ON "PlayerBalanceMatchResult"("playerId");
CREATE INDEX IF NOT EXISTS "PlayerBalanceMatchResult_position_idx" ON "PlayerBalanceMatchResult"("position");
