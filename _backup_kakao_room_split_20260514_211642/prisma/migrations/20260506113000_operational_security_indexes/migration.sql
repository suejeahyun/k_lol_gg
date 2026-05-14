-- Operational hardening indexes.
-- NOTE: Season_only_one_active_idx fails if more than one Season row has isActive = true.
-- Run this first if needed:
-- UPDATE "Season" SET "isActive" = false WHERE id <> <ACTIVE_SEASON_ID>;

CREATE UNIQUE INDEX IF NOT EXISTS "Season_only_one_active_idx"
ON "Season" ("isActive")
WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "MatchSeries_seasonId_matchDate_idx"
ON "MatchSeries" ("seasonId", "matchDate");

CREATE INDEX IF NOT EXISTS "MatchGame_seriesId_gameNumber_idx"
ON "MatchGame" ("seriesId", "gameNumber");

CREATE INDEX IF NOT EXISTS "MatchParticipant_gameId_idx"
ON "MatchParticipant" ("gameId");

CREATE INDEX IF NOT EXISTS "MatchParticipant_playerId_idx"
ON "MatchParticipant" ("playerId");

CREATE INDEX IF NOT EXISTS "MatchParticipant_championId_idx"
ON "MatchParticipant" ("championId");

CREATE INDEX IF NOT EXISTS "SeasonParticipationApply_seasonId_applyDate_status_idx"
ON "SeasonParticipationApply" ("seasonId", "applyDate", "status");

CREATE INDEX IF NOT EXISTS "TeamBalanceDraft_createdAt_idx"
ON "TeamBalanceDraft" ("createdAt");

CREATE INDEX IF NOT EXISTS "TeamBalanceDraft_applyDate_idx"
ON "TeamBalanceDraft" ("applyDate");
