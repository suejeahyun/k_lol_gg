-- Older RecruitParty migrations created a global unique index on recruitNo.
-- Recruit numbers are now scoped by recruitDate + resetSeq, so the legacy single-column
-- uniqueness must be removed or #1/#2 cannot be reused after reset.

ALTER TABLE "RecruitParty" DROP CONSTRAINT IF EXISTS "RecruitParty_recruitNo_key";
DROP INDEX IF EXISTS "RecruitParty_recruitNo_key";

-- Safety: remove the previous daily-only unique index if it still exists.
DROP INDEX IF EXISTS "RecruitParty_recruitDate_recruitNo_key";

-- Correct uniqueness for the current recruit-number model.
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitParty_recruitDate_resetSeq_recruitNo_key"
  ON "RecruitParty"("recruitDate", "resetSeq", "recruitNo");
