-- Stabilization/performance/operations pass
ALTER TABLE "TeamBalanceDraft" ADD COLUMN IF NOT EXISTS "formulaVersion" TEXT DEFAULT 'v3.0.0';
ALTER TABLE "TeamBalanceDraft" ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "TeamBalanceDraft_isOfficial_createdAt_idx" ON "TeamBalanceDraft"("isOfficial", "createdAt");

CREATE TABLE IF NOT EXISTS "RiotApiStatus" (
  "id" SERIAL PRIMARY KEY,
  "scope" TEXT NOT NULL UNIQUE,
  "statusCode" INTEGER,
  "statusText" TEXT,
  "message" TEXT,
  "retryAfterSec" INTEGER,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "RiotApiStatus_statusCode_idx" ON "RiotApiStatus"("statusCode");
CREATE INDEX IF NOT EXISTS "RiotApiStatus_lastFailureAt_idx" ON "RiotApiStatus"("lastFailureAt");

ALTER TABLE "MatchGame" ADD COLUMN IF NOT EXISTS "mvpPlayerId" INTEGER;
ALTER TABLE "MatchGame" ADD COLUMN IF NOT EXISTS "mvpScore" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "MatchGame_mvpPlayerId_idx" ON "MatchGame"("mvpPlayerId");
