/*
  Warnings:

  - You are about to drop the column `cs` on the `MatchParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `gold` on the `MatchParticipant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MatchParticipant" DROP COLUMN "cs",
DROP COLUMN "gold";
