-- K-LOL.GG Discord Operation System

CREATE TABLE IF NOT EXISTS "DiscordAccountLinkLog" (
  "id" SERIAL PRIMARY KEY,
  "userAccountId" INTEGER,
  "action" TEXT NOT NULL,
  "discordId" TEXT,
  "discordUsername" TEXT,
  "discordGlobalName" TEXT,
  "discordServerNickname" TEXT,
  "actorId" INTEGER,
  "actorType" TEXT,
  "reason" TEXT,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordAccountLinkLog_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_userAccountId_createdAt_idx" ON "DiscordAccountLinkLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_discordId_createdAt_idx" ON "DiscordAccountLinkLog"("discordId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_action_createdAt_idx" ON "DiscordAccountLinkLog"("action", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordBotHeartbeat" (
  "id" SERIAL PRIMARY KEY,
  "botId" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'ONLINE',
  "botUsername" TEXT,
  "guildId" TEXT,
  "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
  "memoryRssMb" DOUBLE PRECISION,
  "watchedChannelCount" INTEGER NOT NULL DEFAULT 0,
  "voiceMemberCount" INTEGER NOT NULL DEFAULT 0,
  "autoFinishEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastAutoFinishCheckAt" TIMESTAMP(3),
  "lastError" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DiscordBotHeartbeat_status_updatedAt_idx" ON "DiscordBotHeartbeat"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "DiscordOperationSetting" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DiscordOperationSetting_updatedAt_idx" ON "DiscordOperationSetting"("updatedAt");
