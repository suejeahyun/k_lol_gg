-- Add source reference and Discord notification tracking fields for automatic recruit late warnings.
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

CREATE UNIQUE INDEX IF NOT EXISTS "UserDisciplineRecord_sourceRefKey_key"
  ON "UserDisciplineRecord"("sourceRefKey");

CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_sourceRefType_sourceRefId_idx"
  ON "UserDisciplineRecord"("sourceRefType", "sourceRefId");

CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_discordUserId_idx"
  ON "UserDisciplineRecord"("discordUserId");

CREATE INDEX IF NOT EXISTS "UserDisciplineRecord_discordDmStatus_idx"
  ON "UserDisciplineRecord"("discordDmStatus");
