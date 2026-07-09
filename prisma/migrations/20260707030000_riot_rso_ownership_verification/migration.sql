-- Riot Sign On ownership verification foundation

ALTER TABLE "PlayerRiotAccount"
  ADD COLUMN IF NOT EXISTS "verificationMethod" TEXT NOT NULL DEFAULT 'DIRECT_LINK',
  ADD COLUMN IF NOT EXISTS "verifiedByUserAccountId" INTEGER,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rsoSubject" TEXT;

-- Existing links were created by Riot ID lookup, not Riot OAuth ownership consent.
UPDATE "PlayerRiotAccount"
SET
  "isVerified" = false,
  "verificationMethod" = CASE
    WHEN "verificationMethod" IS NULL OR "verificationMethod" = 'DIRECT_LINK' THEN 'LEGACY_DIRECT_LINK'
    ELSE "verificationMethod"
  END,
  "verifiedByUserAccountId" = NULL,
  "verifiedAt" = NULL,
  "rsoSubject" = NULL;

CREATE TABLE IF NOT EXISTS "RiotRsoVerificationState" (
  "id" SERIAL PRIMARY KEY,
  "userAccountId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "state" TEXT NOT NULL UNIQUE,
  "returnTo" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PlayerRiotAccount_verificationMethod_verifiedAt_idx"
  ON "PlayerRiotAccount"("verificationMethod", "verifiedAt");

CREATE INDEX IF NOT EXISTS "PlayerRiotAccount_verifiedByUserAccountId_verifiedAt_idx"
  ON "PlayerRiotAccount"("verifiedByUserAccountId", "verifiedAt");

CREATE INDEX IF NOT EXISTS "RiotRsoVerificationState_userAccountId_createdAt_idx"
  ON "RiotRsoVerificationState"("userAccountId", "createdAt");

CREATE INDEX IF NOT EXISTS "RiotRsoVerificationState_playerId_createdAt_idx"
  ON "RiotRsoVerificationState"("playerId", "createdAt");

CREATE INDEX IF NOT EXISTS "RiotRsoVerificationState_expiresAt_consumedAt_idx"
  ON "RiotRsoVerificationState"("expiresAt", "consumedAt");
