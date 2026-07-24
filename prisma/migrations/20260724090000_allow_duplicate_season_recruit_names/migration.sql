DROP INDEX IF EXISTS "SeasonPending_recruitNo_unique";

CREATE INDEX IF NOT EXISTS "SeasonPending_recruitNo_name_idx"
  ON "SeasonParticipationPendingApply"("seasonId", "applyDate", "recruitNo", "name", "isReserve");
