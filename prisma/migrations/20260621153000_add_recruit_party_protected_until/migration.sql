ALTER TABLE "RecruitParty" ADD COLUMN IF NOT EXISTS "protectedUntil" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "RecruitParty_protectedUntil_idx" ON "RecruitParty"("protectedUntil");
