-- Add KST day key to RecruitPartyLog so daily recruit numbers reset reliably at 00:00 KST.
ALTER TABLE "RecruitPartyLog" ADD COLUMN IF NOT EXISTS "recruitDate" TEXT;

UPDATE "RecruitPartyLog"
SET "recruitDate" = TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
WHERE "recruitDate" IS NULL OR "recruitDate" = '';

ALTER TABLE "RecruitPartyLog" ALTER COLUMN "recruitDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_recruitNo_idx" ON "RecruitPartyLog"("recruitDate", "recruitNo");
CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_action_idx" ON "RecruitPartyLog"("recruitDate", "action");
