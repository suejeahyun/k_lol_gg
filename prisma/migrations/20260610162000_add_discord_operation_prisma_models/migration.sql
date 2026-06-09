-- Discord operation Prisma model alignment.
-- Safe migration: creates missing tables only, so it can run even if earlier raw SQL already made part of them.

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
  "remoteSettingsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "watchAllVoiceChannels" BOOLEAN NOT NULL DEFAULT false,
  "watchChannelCount" INTEGER NOT NULL DEFAULT 0,
  "lastAutoFinishCheckAt" TIMESTAMP(3),
  "lastAutoFinishAt" TIMESTAMP(3),
  "lastVoiceEventAt" TIMESTAMP(3),
  "lastError" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DiscordBotHeartbeat_updatedAt_idx" ON "DiscordBotHeartbeat"("updatedAt");
CREATE INDEX IF NOT EXISTS "DiscordBotHeartbeat_status_updatedAt_idx" ON "DiscordBotHeartbeat"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "DiscordAccountLinkLog" (
  "id" SERIAL PRIMARY KEY,
  "userAccountId" INTEGER,
  "action" TEXT NOT NULL,
  "discordId" TEXT,
  "discordUsername" TEXT,
  "discordGlobalName" TEXT,
  "discordServerNickname" TEXT,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "reason" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordAccountLinkLog_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_userAccountId_createdAt_idx" ON "DiscordAccountLinkLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_discordId_createdAt_idx" ON "DiscordAccountLinkLog"("discordId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_action_createdAt_idx" ON "DiscordAccountLinkLog"("action", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordRoleSyncLog" (
  "id" SERIAL PRIMARY KEY,
  "userAccountId" INTEGER,
  "discordId" TEXT,
  "action" TEXT NOT NULL,
  "roleId" TEXT,
  "roleName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordRoleSyncLog_userAccountId_createdAt_idx" ON "DiscordRoleSyncLog"("userAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordRoleSyncLog_discordId_createdAt_idx" ON "DiscordRoleSyncLog"("discordId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordRoleSyncLog_status_createdAt_idx" ON "DiscordRoleSyncLog"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordNotificationLog" (
  "id" SERIAL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "channelId" TEXT,
  "title" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordNotificationLog_type_createdAt_idx" ON "DiscordNotificationLog"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordNotificationLog_status_createdAt_idx" ON "DiscordNotificationLog"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordAdminActionLog" (
  "id" SERIAL PRIMARY KEY,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "description" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordAdminActionLog_actorUserId_createdAt_idx" ON "DiscordAdminActionLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAdminActionLog_action_createdAt_idx" ON "DiscordAdminActionLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAdminActionLog_targetType_targetId_idx" ON "DiscordAdminActionLog"("targetType", "targetId");

CREATE TABLE IF NOT EXISTS "DiscordNicknameHistory" (
  "id" SERIAL PRIMARY KEY,
  "discordId" TEXT NOT NULL,
  "oldDisplayName" TEXT,
  "newDisplayName" TEXT,
  "channelId" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordNicknameHistory_discordId_createdAt_idx" ON "DiscordNicknameHistory"("discordId", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordAttendanceSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "snapshotType" TEXT NOT NULL,
  "targetId" TEXT,
  "discordId" TEXT,
  "displayName" TEXT,
  "channelId" TEXT,
  "channelName" TEXT,
  "matchedName" TEXT,
  "matchType" TEXT,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordAttendanceSnapshot_snapshotType_createdAt_idx" ON "DiscordAttendanceSnapshot"("snapshotType", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAttendanceSnapshot_targetId_createdAt_idx" ON "DiscordAttendanceSnapshot"("targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "DiscordAttendanceSnapshot_discordId_createdAt_idx" ON "DiscordAttendanceSnapshot"("discordId", "createdAt");

CREATE TABLE IF NOT EXISTS "DiscordRecruitVerification" (
  "id" SERIAL PRIMARY KEY,
  "recruitPartyId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "channelId" TEXT,
  "channelName" TEXT,
  "participantCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "externalCount" INTEGER NOT NULL DEFAULT 0,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "ambiguousCount" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordRecruitVerification_recruitPartyId_updatedAt_idx" ON "DiscordRecruitVerification"("recruitPartyId", "updatedAt");
CREATE INDEX IF NOT EXISTS "DiscordRecruitVerification_status_updatedAt_idx" ON "DiscordRecruitVerification"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "DiscordMatchAttendanceCheck" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER,
  "matchDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "presentCount" INTEGER NOT NULL DEFAULT 0,
  "lateCount" INTEGER NOT NULL DEFAULT 0,
  "absentCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DiscordMatchAttendanceCheck_seasonId_matchDate_idx" ON "DiscordMatchAttendanceCheck"("seasonId", "matchDate");
CREATE INDEX IF NOT EXISTS "DiscordMatchAttendanceCheck_status_updatedAt_idx" ON "DiscordMatchAttendanceCheck"("status", "updatedAt");
