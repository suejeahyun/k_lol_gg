/*
  Warnings:

  - You are about to drop the column `subPosition` on the `DestructionParticipationApply` table. All the data in the column will be lost.
  - You are about to drop the column `subPosition` on the `EventParticipationApply` table. All the data in the column will be lost.
  - You are about to drop the column `subPosition` on the `SeasonParticipationApply` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DestructionParticipationApply" DROP COLUMN "subPosition",
ADD COLUMN     "subPositions" "ApplyPosition"[];

-- AlterTable
ALTER TABLE "EventParticipationApply" DROP COLUMN "subPosition",
ADD COLUMN     "subPositions" "ApplyPosition"[];

-- AlterTable
ALTER TABLE "SeasonParticipationApply" DROP COLUMN "subPosition",
ADD COLUMN     "subPositions" "ApplyPosition"[];
