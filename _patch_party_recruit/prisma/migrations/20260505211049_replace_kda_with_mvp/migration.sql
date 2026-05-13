/*
  Warnings:

  - You are about to drop the column `kda` on the `PlayerChampionStat` table. All the data in the column will be lost.
  - You are about to drop the column `kda` on the `PlayerSeasonStat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlayerChampionStat" DROP COLUMN "kda",
ADD COLUMN     "mvpCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlayerSeasonStat" DROP COLUMN "kda",
ADD COLUMN     "mvpCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "AdminLog_action_idx" ON "AdminLog"("action");

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");
