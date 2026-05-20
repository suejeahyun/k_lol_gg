-- Add Kakao recruit metadata used by status replies.
ALTER TABLE "RecruitParty"
  ADD COLUMN IF NOT EXISTS "tierText" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredLineText" TEXT;

ALTER TABLE "SeasonParticipationApply"
  ADD COLUMN IF NOT EXISTS "applyTimeText" TEXT;
