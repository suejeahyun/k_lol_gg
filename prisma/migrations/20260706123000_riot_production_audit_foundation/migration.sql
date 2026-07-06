-- Riot Production 준비 2단계: 연동/호출/동기화 감사 로그 기반 추가

ALTER TABLE "PlayerRiotAccount"
  ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "linkedByUserAccountId" INTEGER,
  ADD COLUMN IF NOT EXISTS "linkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unlinkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "syncStatus" TEXT NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS "lastErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "RiotAccountLinkLog" (
  "id" SERIAL NOT NULL,
  "playerId" INTEGER,
  "userAccountId" INTEGER,
  "action" TEXT NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "gameName" TEXT,
  "tagLine" TEXT,
  "puuid" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiotAccountLinkLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RiotApiRequestLog" (
  "id" SERIAL NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'GET',
  "statusCode" INTEGER,
  "target" TEXT,
  "source" TEXT NOT NULL DEFAULT 'RIOT_CLIENT',
  "userAccountId" INTEGER,
  "playerId" INTEGER,
  "durationMs" INTEGER,
  "errorCode" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiotApiRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RiotSyncJob" (
  "id" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requestedByUserAccountId" INTEGER,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiotSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlayerRiotAccount_syncStatus_lastSyncedAt_idx" ON "PlayerRiotAccount"("syncStatus", "lastSyncedAt");
CREATE INDEX IF NOT EXISTS "PlayerRiotAccount_isVerified_idx" ON "PlayerRiotAccount"("isVerified");

CREATE INDEX IF NOT EXISTS "RiotAccountLinkLog_playerId_createdAt_idx" ON "RiotAccountLinkLog"("playerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotAccountLinkLog_userAccountId_createdAt_idx" ON "RiotAccountLinkLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotAccountLinkLog_action_createdAt_idx" ON "RiotAccountLinkLog"("action", "createdAt");

CREATE INDEX IF NOT EXISTS "RiotApiRequestLog_source_createdAt_idx" ON "RiotApiRequestLog"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotApiRequestLog_playerId_createdAt_idx" ON "RiotApiRequestLog"("playerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotApiRequestLog_userAccountId_createdAt_idx" ON "RiotApiRequestLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotApiRequestLog_statusCode_createdAt_idx" ON "RiotApiRequestLog"("statusCode", "createdAt");

CREATE INDEX IF NOT EXISTS "RiotSyncJob_type_status_createdAt_idx" ON "RiotSyncJob"("type", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "RiotSyncJob_requestedByUserAccountId_createdAt_idx" ON "RiotSyncJob"("requestedByUserAccountId", "createdAt");
