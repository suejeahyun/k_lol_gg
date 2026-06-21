-- Store Discord operation checks, API errors, DM results and admin-log results for operation statistics.
ALTER TABLE "RecruitParty" ADD COLUMN IF NOT EXISTS "protectedUntil" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "RecruitParty_protectedUntil_idx" ON "RecruitParty"("protectedUntil");

ALTER TABLE "UserDisciplineRecord"
  ADD COLUMN IF NOT EXISTS "sourceRefType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRefId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRefKey" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceMeta" JSONB,
  ADD COLUMN IF NOT EXISTS "discordUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "discordAdminNotifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discordDmStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "discordDmSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discordDmError" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "UserDisciplineRecord_sourceRefKey_key" ON "UserDisciplineRecord"("sourceRefKey");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_sourceRefType_sourceRefId_idx" ON "UserDisciplineRecord"("sourceRefType", "sourceRefId");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_discordUserId_idx" ON "UserDisciplineRecord"("discordUserId");
CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_discordDmStatus_idx" ON "UserDisciplineRecord"("discordDmStatus");

CREATE TABLE IF NOT EXISTS "DiscordOperationLog" (
  "id" SERIAL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "source" TEXT,
  "endpoint" TEXT,
  "status" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "channelId" TEXT,
  "channelName" TEXT,
  "recruitId" INTEGER,
  "recruitNo" INTEGER,
  "discordId" TEXT,
  "message" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordOperationLog_type_createdAt_idx" ON "DiscordOperationLog"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordOperationLog_endpoint_createdAt_idx" ON "DiscordOperationLog"("endpoint", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordOperationLog_status_createdAt_idx" ON "DiscordOperationLog"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordOperationLog_channelId_createdAt_idx" ON "DiscordOperationLog"("channelId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordOperationLog_createdAt_idx" ON "DiscordOperationLog"("createdAt");
