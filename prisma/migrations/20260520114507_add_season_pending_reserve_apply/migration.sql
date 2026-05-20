/*
  Warnings:

  - You are about to drop the column `highlightYoutubeUrls` on the `DestructionTournament` table. All the data in the column will be lost.
  - You are about to drop the `DestructionYoutubeHighlight` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DestructionMatch" DROP CONSTRAINT "DestructionMatch_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "DestructionParticipant" DROP CONSTRAINT "DestructionParticipant_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "DestructionTeam" DROP CONSTRAINT "DestructionTeam_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "DestructionYoutubeHighlight" DROP CONSTRAINT "DestructionYoutubeHighlight_tournamentId_fkey";

-- DropForeignKey
ALTER TABLE "EventParticipant" DROP CONSTRAINT "EventParticipant_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventTeam" DROP CONSTRAINT "EventTeam_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventTournamentMatch" DROP CONSTRAINT "EventTournamentMatch_eventId_fkey";

-- DropForeignKey
ALTER TABLE "MatchGame" DROP CONSTRAINT "MatchGame_seriesId_fkey";

-- DropForeignKey
ALTER TABLE "MatchParticipant" DROP CONSTRAINT "MatchParticipant_gameId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerSeasonStat" DROP CONSTRAINT "PlayerSeasonStat_seasonId_fkey";

-- DropForeignKey
ALTER TABLE "SeasonResult" DROP CONSTRAINT "SeasonResult_seasonId_fkey";

-- DropIndex
DROP INDEX "Player_isActive_idx";

-- DropIndex
DROP INDEX "RecruitParty_recruitDate_status_idx";

-- DropIndex
DROP INDEX "RecruitPartyLog_recruitDate_action_createdAt_idx";

-- DropIndex
DROP INDEX "RecruitPartyLog_recruitDate_action_idx";

-- DropIndex
DROP INDEX "RecruitPartyLog_recruitDate_recruitNo_idx";

-- AlterTable
ALTER TABLE "BalanceMatchReview" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DestructionTournament" DROP COLUMN "highlightYoutubeUrls";

-- AlterTable
ALTER TABLE "PlayerBalanceProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecruitPartyLog" ALTER COLUMN "recruitDate" SET DEFAULT '';

-- AlterTable
ALTER TABLE "RiotApiStatus" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SeasonParticipationPendingApply" ALTER COLUMN "subPositions" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "DestructionYoutubeHighlight";

-- CreateIndex
CREATE INDEX "DestructionTournament_galleryImageId_idx" ON "DestructionTournament"("galleryImageId");

-- CreateIndex
CREATE INDEX "EventMatch_galleryImageId_idx" ON "EventMatch"("galleryImageId");

-- AddForeignKey
ALTER TABLE "MatchGame" ADD CONSTRAINT "MatchGame_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MatchSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MatchGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTournamentMatch" ADD CONSTRAINT "EventTournamentMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionTeam" ADD CONSTRAINT "DestructionTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipant" ADD CONSTRAINT "DestructionParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionMatch" ADD CONSTRAINT "DestructionMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SeasonParticipationPendingApply_seasonId_applyDate_isReserve_id" RENAME TO "SeasonParticipationPendingApply_seasonId_applyDate_isReserv_idx";

-- RenameIndex
ALTER INDEX "SeasonParticipationPendingApply_seasonId_applyDate_name_isReser" RENAME TO "SeasonParticipationPendingApply_seasonId_applyDate_name_isR_key";
