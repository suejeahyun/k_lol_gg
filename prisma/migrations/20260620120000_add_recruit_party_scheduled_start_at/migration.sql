ALTER TABLE "RecruitParty" ADD COLUMN "scheduledStartAt" TIMESTAMP(3);

CREATE INDEX "RecruitParty_scheduledStartAt_idx" ON "RecruitParty"("scheduledStartAt");
