-- Add dedicated TFT recruit types.
ALTER TYPE "RecruitPartyType" ADD VALUE IF NOT EXISTS 'TFT_NORMAL';
ALTER TYPE "RecruitPartyType" ADD VALUE IF NOT EXISTS 'TFT_RANK';
ALTER TYPE "RecruitPartyType" ADD VALUE IF NOT EXISTS 'DOUBLE_UP';

-- Store the KST calendar day used for daily recruit number reset.
ALTER TABLE "RecruitParty" ADD COLUMN IF NOT EXISTS "recruitDate" TEXT;

UPDATE "RecruitParty"
SET "recruitDate" = TO_CHAR(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD')
WHERE "recruitDate" IS NULL OR "recruitDate" = '';

ALTER TABLE "RecruitParty" ALTER COLUMN "recruitDate" SET NOT NULL;

-- Previous schema made recruitNo globally unique. Daily reset requires uniqueness per KST date.
ALTER TABLE "RecruitParty" DROP CONSTRAINT IF EXISTS "RecruitParty_recruitNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "RecruitParty_recruitDate_recruitNo_key"
ON "RecruitParty"("recruitDate", "recruitNo");

CREATE INDEX IF NOT EXISTS "RecruitParty_recruitDate_status_idx"
ON "RecruitParty"("recruitDate", "status");
