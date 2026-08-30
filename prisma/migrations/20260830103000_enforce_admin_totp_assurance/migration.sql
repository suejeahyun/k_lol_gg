-- The column may already exist on installations that applied the original
-- admin TOTP migration. Keep this reconciliation migration idempotent.
ALTER TABLE "UserAccount"
ADD COLUMN IF NOT EXISTS "adminTotpLastUsedStep" BIGINT;
