-- Repair Discord operation tables created by earlier partial/raw migrations.
-- This migration is intentionally idempotent and only adds missing columns/indexes.

CREATE TABLE IF NOT EXISTS "DiscordOperationSetting" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "description" TEXT,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DiscordOperationSetting"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "DiscordOperationSetting_updatedAt_idx" ON "DiscordOperationSetting"("updatedAt");

CREATE TABLE IF NOT EXISTS "DiscordBotHeartbeat" (
  "id" SERIAL PRIMARY KEY,
  "botId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DiscordBotHeartbeat"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN IF NOT EXISTS "botUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "botUserTag" TEXT,
  ADD COLUMN IF NOT EXISTS "guildId" TEXT,
  ADD COLUMN IF NOT EXISTS "guildCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "uptimeSec" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "memoryRssMb" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "watchedChannelCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "voiceMemberCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "autoFinishEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "remoteSettingsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "watchAllVoiceChannels" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "watchChannelCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAutoFinishCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAutoFinishAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastVoiceEventAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "rawJson" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "DiscordBotHeartbeat_updatedAt_idx" ON "DiscordBotHeartbeat"("updatedAt");
CREATE INDEX IF NOT EXISTS "DiscordBotHeartbeat_status_updatedAt_idx" ON "DiscordBotHeartbeat"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "DiscordAccountLinkLog" (
  "id" SERIAL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DiscordAccountLinkLog"
  ADD COLUMN IF NOT EXISTS "userAccountId" INTEGER,
  ADD COLUMN IF NOT EXISTS "discordId" TEXT,
  ADD COLUMN IF NOT EXISTS "discordUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "discordGlobalName" TEXT,
  ADD COLUMN IF NOT EXISTS "discordServerNickname" TEXT,
  ADD COLUMN IF NOT EXISTS "actorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "actorRole" TEXT,
  ADD COLUMN IF NOT EXISTS "actorId" INTEGER,
  ADD COLUMN IF NOT EXISTS "actorType" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "rawJson" JSONB,
  ADD COLUMN IF NOT EXISTS "beforeJson" JSONB,
  ADD COLUMN IF NOT EXISTS "afterJson" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiscordAccountLinkLog_userAccountId_fkey'
  ) THEN
    ALTER TABLE "DiscordAccountLinkLog"
      ADD CONSTRAINT "DiscordAccountLinkLog_userAccountId_fkey"
      FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_userAccountId_createdAt_idx" ON "DiscordAccountLinkLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_discordId_createdAt_idx" ON "DiscordAccountLinkLog"("discordId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_action_createdAt_idx" ON "DiscordAccountLinkLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_actorId_createdAt_idx" ON "DiscordAccountLinkLog"("actorId", "createdAt");
