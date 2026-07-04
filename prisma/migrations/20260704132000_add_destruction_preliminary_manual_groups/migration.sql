-- Add manual preliminary group labels for destruction tournaments.
ALTER TABLE "DestructionTeam" ADD COLUMN "preliminaryGroup" TEXT;
ALTER TABLE "DestructionMatch" ADD COLUMN "preliminaryGroup" TEXT;

CREATE INDEX "DestructionTeam_tournamentId_preliminaryGroup_idx" ON "DestructionTeam"("tournamentId", "preliminaryGroup");
CREATE INDEX "DestructionMatch_tournamentId_stage_preliminaryGroup_idx" ON "DestructionMatch"("tournamentId", "stage", "preliminaryGroup");
