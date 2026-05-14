ALTER TABLE "SeasonParticipationApply"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SITE',
ADD COLUMN "sourceRoom" TEXT,
ADD COLUMN "sourceSender" TEXT,
ADD COLUMN "sourceMessageHash" TEXT,
ADD COLUMN "sourceSlotNo" INTEGER;

CREATE INDEX "SeasonParticipationApply_seasonId_applyDate_source_status_idx"
ON "SeasonParticipationApply"("seasonId", "applyDate", "source", "status");

CREATE INDEX "SeasonParticipationApply_sourceMessageHash_idx"
ON "SeasonParticipationApply"("sourceMessageHash");
