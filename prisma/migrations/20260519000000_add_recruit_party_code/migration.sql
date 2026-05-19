-- Store a page-only recruit management code such as 2026-05-19-3-14.
-- The code is intentionally not exposed in Kakao bot replies.

ALTER TABLE "RecruitParty"
  ADD COLUMN IF NOT EXISTS "recruitCode" TEXT;

UPDATE "RecruitParty"
SET "recruitCode" = "recruitDate" || '-' || "maxMembers"::text || '-' || "recruitNo"::text
WHERE "recruitCode" IS NULL;

CREATE INDEX IF NOT EXISTS "RecruitParty_recruitCode_idx"
  ON "RecruitParty"("recruitCode");
