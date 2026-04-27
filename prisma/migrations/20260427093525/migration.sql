/*
  Warnings:

  - A unique constraint covering the columns `[seasonId,playerId,applyDate]` on the table `SeasonParticipationApply` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `applyDate` to the `SeasonParticipationApply` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "SeasonParticipationApply_seasonId_playerId_key";

-- AlterTable
ALTER TABLE "SeasonParticipationApply" ADD COLUMN     "applyDate" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SeasonParticipationApply_seasonId_playerId_applyDate_key" ON "SeasonParticipationApply"("seasonId", "playerId", "applyDate");
