-- Keep existing active Kakao recruit parties when the daily recruit number sequence resets.
-- The same recruitNo can be reused inside the same KST date after a reset by separating rows with resetSeq.

ALTER TABLE "RecruitParty" ADD COLUMN IF NOT EXISTS "resetSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RecruitPartyLog" ADD COLUMN IF NOT EXISTS "resetSeq" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "RecruitParty_recruitDate_recruitNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "RecruitParty_recruitDate_resetSeq_recruitNo_key"
  ON "RecruitParty"("recruitDate", "resetSeq", "recruitNo");

CREATE INDEX IF NOT EXISTS "RecruitParty_recruitDate_resetSeq_status_idx"
  ON "RecruitParty"("recruitDate", "resetSeq", "status");

CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_resetSeq_recruitNo_idx"
  ON "RecruitPartyLog"("recruitDate", "resetSeq", "recruitNo");

CREATE INDEX IF NOT EXISTS "RecruitPartyLog_recruitDate_resetSeq_action_createdAt_idx"
  ON "RecruitPartyLog"("recruitDate", "resetSeq", "action", "createdAt");
