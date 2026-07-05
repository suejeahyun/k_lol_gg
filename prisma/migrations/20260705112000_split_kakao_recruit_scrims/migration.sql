DO $$ BEGIN
  CREATE TYPE "DestructionScrimRecruitStatus" AS ENUM ('RECRUITING', 'MATCHED', 'CONFIRMED', 'COMPLETED', 'CANCELED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DestructionScrimRecruit" (
  "id" SERIAL PRIMARY KEY,
  "scrimNo" INTEGER NOT NULL,
  "recruitDate" TEXT NOT NULL,
  "tournamentId" INTEGER NOT NULL,
  "requesterTeamId" INTEGER,
  "opponentTeamId" INTEGER,
  "requesterTeamName" TEXT,
  "opponentTeamName" TEXT,
  "title" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "startTimeText" TEXT,
  "gameCount" INTEGER,
  "memo" TEXT,
  "status" "DestructionScrimRecruitStatus" NOT NULL DEFAULT 'RECRUITING',
  "roomName" TEXT,
  "sender" TEXT,
  "sourceMessage" TEXT,
  "sourceMessageHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestructionScrimRecruit_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DestructionScrimRecruit_requesterTeamId_fkey" FOREIGN KEY ("requesterTeamId") REFERENCES "DestructionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DestructionScrimRecruit_opponentTeamId_fkey" FOREIGN KEY ("opponentTeamId") REFERENCES "DestructionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DestructionScrimRecruitLog" (
  "id" SERIAL PRIMARY KEY,
  "scrimNo" INTEGER NOT NULL,
  "recruitDate" TEXT NOT NULL,
  "tournamentId" INTEGER,
  "action" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "roomName" TEXT,
  "sender" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "DestructionScrimRecruit_recruitDate_scrimNo_key" ON "DestructionScrimRecruit"("recruitDate", "scrimNo");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruit_tournamentId_status_idx" ON "DestructionScrimRecruit"("tournamentId", "status");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruit_status_updatedAt_idx" ON "DestructionScrimRecruit"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruit_scheduledAt_idx" ON "DestructionScrimRecruit"("scheduledAt");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruit_sourceMessageHash_idx" ON "DestructionScrimRecruit"("sourceMessageHash");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruitLog_recruitDate_scrimNo_idx" ON "DestructionScrimRecruitLog"("recruitDate", "scrimNo");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruitLog_tournamentId_idx" ON "DestructionScrimRecruitLog"("tournamentId");
CREATE INDEX IF NOT EXISTS "DestructionScrimRecruitLog_action_createdAt_idx" ON "DestructionScrimRecruitLog"("action", "createdAt");
