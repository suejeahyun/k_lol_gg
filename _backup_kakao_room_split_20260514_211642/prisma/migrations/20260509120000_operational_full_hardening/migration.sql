-- K-LOL.GG operational hardening migration.
-- Non-destructive columns and indexes for auditability, operational safety, and query performance.

ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "actorId" INTEGER;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "actorType" TEXT;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "targetId" INTEGER;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "beforeJson" JSONB;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "afterJson" JSONB;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "AdminLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

CREATE INDEX IF NOT EXISTS "AdminLog_actorId_idx" ON "AdminLog"("actorId");
CREATE INDEX IF NOT EXISTS "AdminLog_targetType_targetId_idx" ON "AdminLog"("targetType", "targetId");

-- Duplicate guard indexes. These are safe when existing data is clean.
CREATE UNIQUE INDEX IF NOT EXISTS "MatchGame_seriesId_gameNumber_key" ON "MatchGame"("seriesId", "gameNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonResult_seasonId_category_playerId_key" ON "SeasonResult"("seasonId", "category", "playerId");
CREATE INDEX IF NOT EXISTS "SeasonResult_seasonId_category_value_idx" ON "SeasonResult"("seasonId", "category", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTeam_eventId_name_key" ON "EventTeam"("eventId", "name");
CREATE INDEX IF NOT EXISTS "EventTeam_eventId_seed_idx" ON "EventTeam"("eventId", "seed");
CREATE INDEX IF NOT EXISTS "EventParticipant_eventId_teamId_idx" ON "EventParticipant"("eventId", "teamId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTournamentMatch_eventId_stage_round_key" ON "EventTournamentMatch"("eventId", "stage", "round");
CREATE INDEX IF NOT EXISTS "EventTournamentMatch_eventId_winnerTeamId_idx" ON "EventTournamentMatch"("eventId", "winnerTeamId");
CREATE UNIQUE INDEX IF NOT EXISTS "DestructionTeam_tournamentId_name_key" ON "DestructionTeam"("tournamentId", "name");
CREATE INDEX IF NOT EXISTS "DestructionTeam_tournamentId_points_wins_losses_idx" ON "DestructionTeam"("tournamentId", "points", "wins", "losses");
CREATE INDEX IF NOT EXISTS "DestructionParticipant_tournamentId_teamId_idx" ON "DestructionParticipant"("tournamentId", "teamId");
CREATE UNIQUE INDEX IF NOT EXISTS "DestructionMatch_tournamentId_stage_round_key" ON "DestructionMatch"("tournamentId", "stage", "round");
CREATE INDEX IF NOT EXISTS "DestructionMatch_tournamentId_winnerTeamId_idx" ON "DestructionMatch"("tournamentId", "winnerTeamId");
CREATE INDEX IF NOT EXISTS "EventMatch_status_eventDate_idx" ON "EventMatch"("status", "eventDate");
CREATE INDEX IF NOT EXISTS "DestructionTournament_status_startDate_idx" ON "DestructionTournament"("status", "startDate");
