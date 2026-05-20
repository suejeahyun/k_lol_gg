/*
  Warnings:

  - You are about to drop the column `position` on the `DestructionParticipationApply` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `EventParticipationApply` table. All the data in the column will be lost.
  - Added the required column `mainPosition` to the `DestructionParticipationApply` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ApplyPosition" AS ENUM ('TOP', 'JGL', 'MID', 'ADC', 'SUP', 'ALL');

-- AlterTable
ALTER TABLE "DestructionParticipationApply" DROP COLUMN "position",
ADD COLUMN     "mainPosition" "ApplyPosition" NOT NULL,
ADD COLUMN     "subPosition" "ApplyPosition";

-- AlterTable
ALTER TABLE "EventParticipationApply" DROP COLUMN "position",
ADD COLUMN     "mainPosition" "ApplyPosition",
ADD COLUMN     "subPosition" "ApplyPosition";

-- AlterTable
ALTER TABLE "SeasonParticipationApply" ADD COLUMN     "mainPosition" "ApplyPosition",
ADD COLUMN     "subPosition" "ApplyPosition";
