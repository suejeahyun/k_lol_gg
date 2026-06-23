ALTER TABLE "SeasonParticipationApply"
  ADD COLUMN IF NOT EXISTS "recruitNo" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SeasonParticipationPendingApply"
  ADD COLUMN IF NOT EXISTS "recruitNo" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "SeasonParticipationApply_seasonId_playerId_applyDate_key";
DROP INDEX IF EXISTS "SeasonParticipationPendingApply_seasonId_applyDate_name_isReserve_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonApply_recruitNo_unique"
  ON "SeasonParticipationApply"("seasonId", "playerId", "applyDate", "recruitNo");

CREATE INDEX IF NOT EXISTS "SeasonApply_recruitNo_status_idx"
  ON "SeasonParticipationApply"("seasonId", "applyDate", "recruitNo", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonPending_recruitNo_unique"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "recruitNo", "name", "isReserve");

CREATE INDEX IF NOT EXISTS "SeasonPending_recruitNo_reserve_idx"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "recruitNo", "isReserve");
