ALTER TABLE "UserAccount"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "UserAccount_deletedAt_idx" ON "UserAccount"("deletedAt");