-- Make DiscordAccountLinkLog compatible with the Discord account-link helper.
-- Existing installations may already have actorUserId/actorRole/rawJson from earlier patches.
-- These fields are the ones used by src/lib/discord/account-link.ts.

ALTER TABLE "DiscordAccountLinkLog"
  ADD COLUMN IF NOT EXISTS "actorId" INTEGER,
  ADD COLUMN IF NOT EXISTS "actorType" TEXT,
  ADD COLUMN IF NOT EXISTS "beforeJson" JSONB,
  ADD COLUMN IF NOT EXISTS "afterJson" JSONB;

CREATE INDEX IF NOT EXISTS "DiscordAccountLinkLog_actorId_createdAt_idx"
  ON "DiscordAccountLinkLog"("actorId", "createdAt");
