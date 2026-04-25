-- CreateEnum
CREATE TYPE "EventMatchStatus" AS ENUM ('PLANNED', 'RECRUITING', 'TEAM_BUILDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventMatchMode" AS ENUM ('POSITION', 'ARAM');

-- CreateEnum
CREATE TYPE "EventTournamentStage" AS ENUM ('ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL');

-- CreateTable
CREATE TABLE "EventMatch" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventMatchStatus" NOT NULL DEFAULT 'PLANNED',
    "mode" "EventMatchMode" NOT NULL DEFAULT 'POSITION',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "recruitFrom" TIMESTAMP(3),
    "recruitTo" TIMESTAMP(3),
    "winnerTeamId" INTEGER,
    "mvpPlayerId" INTEGER,
    "galleryImageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTeam" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "seed" INTEGER,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "EventTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "playerId" INTEGER NOT NULL,
    "position" "Position",
    "balanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTournamentMatch" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "stage" "EventTournamentStage" NOT NULL,
    "round" INTEGER NOT NULL,
    "teamAId" INTEGER NOT NULL,
    "teamBId" INTEGER NOT NULL,
    "winnerTeamId" INTEGER,
    "matchDate" TIMESTAMP(3),
    "mvpPlayerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_playerId_key" ON "EventParticipant"("eventId", "playerId");

-- AddForeignKey
ALTER TABLE "EventMatch" ADD CONSTRAINT "EventMatch_galleryImageId_fkey" FOREIGN KEY ("galleryImageId") REFERENCES "GalleryImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTeam" ADD CONSTRAINT "EventTeam_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "EventTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTournamentMatch" ADD CONSTRAINT "EventTournamentMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTournamentMatch" ADD CONSTRAINT "EventTournamentMatch_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "EventTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTournamentMatch" ADD CONSTRAINT "EventTournamentMatch_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "EventTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
