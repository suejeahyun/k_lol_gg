ALTER TABLE "UserAccount" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordId" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordUsername" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordGlobalName" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordServerNickname" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordAvatar" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordLinkedAt" TIMESTAMP(3);
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordParsedBirthYear" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordParsedName" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordParsedNickname" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordParsedTier" TEXT;
ALTER TABLE "UserAccount" ADD COLUMN IF NOT EXISTS "discordLinkStatus" TEXT NOT NULL DEFAULT 'UNLINKED';

CREATE UNIQUE INDEX IF NOT EXISTS "UserAccount_discordId_key" ON "UserAccount"("discordId");

CREATE TABLE IF NOT EXISTS "DiscordVoiceEvent" (
  "id" SERIAL NOT NULL,
  "discordId" TEXT NOT NULL,
  "channelId" TEXT,
  "previousChannelId" TEXT,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawJson" JSONB,
  "userAccountId" INTEGER,
  CONSTRAINT "DiscordVoiceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DiscordVoiceEvent_discordId_occurredAt_idx" ON "DiscordVoiceEvent"("discordId", "occurredAt");
CREATE INDEX IF NOT EXISTS "DiscordVoiceEvent_channelId_occurredAt_idx" ON "DiscordVoiceEvent"("channelId", "occurredAt");
CREATE INDEX IF NOT EXISTS "DiscordVoiceEvent_eventType_occurredAt_idx" ON "DiscordVoiceEvent"("eventType", "occurredAt");

DO $$ BEGIN
  ALTER TABLE "DiscordVoiceEvent" ADD CONSTRAINT "DiscordVoiceEvent_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RecruitPartyDiscordMonitor" (
  "id" SERIAL NOT NULL,
  "partyId" INTEGER NOT NULL,
  "voiceChannelId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastExpectedCount" INTEGER NOT NULL DEFAULT 0,
  "lastPresentExpectedCount" INTEGER NOT NULL DEFAULT 0,
  "lastNonParticipantCount" INTEGER NOT NULL DEFAULT 0,
  "finishCandidateStartedAt" TIMESTAMP(3),
  "lastScannedAt" TIMESTAMP(3),
  "autoFinishedAt" TIMESTAMP(3),
  "autoFinishReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecruitPartyDiscordMonitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecruitPartyDiscordMonitor_partyId_key" ON "RecruitPartyDiscordMonitor"("partyId");
CREATE INDEX IF NOT EXISTS "RecruitPartyDiscordMonitor_voiceChannelId_idx" ON "RecruitPartyDiscordMonitor"("voiceChannelId");
CREATE INDEX IF NOT EXISTS "RecruitPartyDiscordMonitor_status_updatedAt_idx" ON "RecruitPartyDiscordMonitor"("status", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "RecruitPartyDiscordMonitor" ADD CONSTRAINT "RecruitPartyDiscordMonitor_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "RecruitParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
