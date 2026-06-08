ALTER TABLE "DiscordVoiceEvent"
  ADD COLUMN IF NOT EXISTS "channelName" TEXT,
  ADD COLUMN IF NOT EXISTS "previousChannelName" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "previousCategoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryName" TEXT,
  ADD COLUMN IF NOT EXISTS "previousCategoryName" TEXT,
  ADD COLUMN IF NOT EXISTS "discordUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "discordGlobalName" TEXT,
  ADD COLUMN IF NOT EXISTS "discordServerNickname" TEXT,
  ADD COLUMN IF NOT EXISTS "memberDisplayName" TEXT,
  ADD COLUMN IF NOT EXISTS "memberNickname" TEXT;

CREATE INDEX IF NOT EXISTS "DiscordVoiceEvent_channelName_occurredAt_idx"
  ON "DiscordVoiceEvent"("channelName", "occurredAt");

CREATE INDEX IF NOT EXISTS "DiscordVoiceEvent_categoryId_occurredAt_idx"
  ON "DiscordVoiceEvent"("categoryId", "occurredAt");
