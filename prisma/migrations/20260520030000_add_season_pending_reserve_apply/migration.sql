-- Store Kakao season-recruit participants that cannot be linked to Player yet,
-- and reserve entries written as `예비 1. 이름/티어/티어/라인`.
CREATE TABLE IF NOT EXISTS "SeasonParticipationPendingApply" (
  "id" SERIAL PRIMARY KEY,
  "seasonId" INTEGER NOT NULL,
  "applyDate" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL,
  "currentTier" TEXT NOT NULL,
  "peakTier" TEXT NOT NULL,
  "mainPosition" "ApplyPosition",
  "subPositions" "ApplyPosition"[] DEFAULT ARRAY[]::"ApplyPosition"[],
  "isReserve" BOOLEAN NOT NULL DEFAULT false,
  "sourceSlotNo" INTEGER,
  "reserveSlotNo" INTEGER,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'KAKAO_RECRUIT',
  "sourceRoom" TEXT,
  "sourceSender" TEXT,
  "sourceMessageHash" TEXT,
  "applyTimeText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonParticipationPendingApply_seasonId_fkey'
  ) THEN
    ALTER TABLE "SeasonParticipationPendingApply"
    ADD CONSTRAINT "SeasonParticipationPendingApply_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonParticipationPendingApply_seasonId_applyDate_name_isReserve_key"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "name", "isReserve");

CREATE INDEX IF NOT EXISTS "SeasonParticipationPendingApply_seasonId_applyDate_isReserve_idx"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "isReserve");

CREATE INDEX IF NOT EXISTS "SeasonParticipationPendingApply_seasonId_applyDate_source_idx"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "source");

CREATE INDEX IF NOT EXISTS "SeasonParticipationPendingApply_sourceMessageHash_idx"
  ON "SeasonParticipationPendingApply"("sourceMessageHash");
