/*
  Warnings:

  - You are about to drop the `PlayerRiotChampionSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlayerRiotSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlayerRiotChampionSnapshot" DROP CONSTRAINT "PlayerRiotChampionSnapshot_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerRiotSnapshot" DROP CONSTRAINT "PlayerRiotSnapshot_playerId_fkey";

-- DropTable
DROP TABLE "PlayerRiotChampionSnapshot";

-- DropTable
DROP TABLE "PlayerRiotSnapshot";
