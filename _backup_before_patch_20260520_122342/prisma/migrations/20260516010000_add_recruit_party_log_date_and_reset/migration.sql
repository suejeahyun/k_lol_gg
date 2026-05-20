-- Add date key for Kakao party recruit logs so daily numbering can be reset safely.
ALTER TABLE "RecruitPartyLog"
ADD COLUMN IF NOT EXISTS "recruitDate" TEXT NOT NULL DEFAULT '';

UPDATE "RecruitPartyLog"
SET "recruitDate" = TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
WHERE "recruitDate" IS NULL OR "recruitDate" = '';

CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_recruitNo_idx"
ON "RecruitPartyLog"("recruitDate", "recruitNo");

CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_action_createdAt_idx"
ON "RecruitPartyLog"("recruitDate", "action", "createdAt");
