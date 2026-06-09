CREATE TABLE IF NOT EXISTS "UserDisciplineRecord" (
  "id" SERIAL PRIMARY KEY,
  "userAccountId" INTEGER,
  "playerId" INTEGER,
  "targetName" TEXT NOT NULL,
  "targetNickname" TEXT,
  "targetTag" TEXT,
  "type" TEXT NOT NULL DEFAULT 'CAUTION',
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "resetAt" TIMESTAMP(3),
  "resetReason" TEXT,
  "resetBy" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDisciplineRecord_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UserDisciplineRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_userAccountId_isActive_idx" ON "UserDisciplineRecord"("userAccountId", "isActive");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_playerId_isActive_idx" ON "UserDisciplineRecord"("playerId", "isActive");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_type_isActive_idx" ON "UserDisciplineRecord"("type", "isActive");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_createdAt_idx" ON "UserDisciplineRecord"("createdAt");
