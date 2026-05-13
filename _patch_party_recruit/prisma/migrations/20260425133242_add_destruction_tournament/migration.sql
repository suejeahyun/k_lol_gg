-- CreateEnum
CREATE TYPE "DestructionStatus" AS ENUM ('PLANNED', 'RECRUITING', 'TEAM_BUILDING', 'PRELIMINARY', 'TOURNAMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DestructionStage" AS ENUM ('PRELIMINARY', 'SEMI_FINAL', 'FINAL');

-- CreateTable
CREATE TABLE "DestructionTournament" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DestructionStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "winnerTeamId" INTEGER,
    "mvpPlayerId" INTEGER,
    "galleryImageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DestructionTournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestructionTeam" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DestructionTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestructionParticipant" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "playerId" INTEGER NOT NULL,
    "position" "Position" NOT NULL,
    "balanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DestructionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestructionMatch" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "stage" "DestructionStage" NOT NULL,
    "round" INTEGER NOT NULL,
    "teamAId" INTEGER NOT NULL,
    "teamBId" INTEGER NOT NULL,
    "winnerTeamId" INTEGER,
    "mvpPlayerId" INTEGER,
    "isReplay" BOOLEAN NOT NULL DEFAULT false,
    "matchDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DestructionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DestructionParticipant_tournamentId_playerId_key" ON "DestructionParticipant"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "DestructionTournament" ADD CONSTRAINT "DestructionTournament_galleryImageId_fkey" FOREIGN KEY ("galleryImageId") REFERENCES "GalleryImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionTeam" ADD CONSTRAINT "DestructionTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionTeam" ADD CONSTRAINT "DestructionTeam_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipant" ADD CONSTRAINT "DestructionParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipant" ADD CONSTRAINT "DestructionParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DestructionTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipant" ADD CONSTRAINT "DestructionParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionMatch" ADD CONSTRAINT "DestructionMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionMatch" ADD CONSTRAINT "DestructionMatch_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "DestructionTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionMatch" ADD CONSTRAINT "DestructionMatch_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "DestructionTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
