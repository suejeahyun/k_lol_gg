-- CreateEnum
CREATE TYPE "ParticipationApplyStatus" AS ENUM ('APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SeasonParticipationApply" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "status" "ParticipationApplyStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonParticipationApply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipationApply" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "position" "Position",
    "status" "ParticipationApplyStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventParticipationApply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestructionParticipationApply" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "position" "Position" NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "status" "ParticipationApplyStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DestructionParticipationApply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeasonParticipationApply_seasonId_playerId_key" ON "SeasonParticipationApply"("seasonId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipationApply_eventId_playerId_key" ON "EventParticipationApply"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DestructionParticipationApply_tournamentId_playerId_key" ON "DestructionParticipationApply"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "SeasonParticipationApply" ADD CONSTRAINT "SeasonParticipationApply_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonParticipationApply" ADD CONSTRAINT "SeasonParticipationApply_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipationApply" ADD CONSTRAINT "EventParticipationApply_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipationApply" ADD CONSTRAINT "EventParticipationApply_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipationApply" ADD CONSTRAINT "DestructionParticipationApply_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestructionParticipationApply" ADD CONSTRAINT "DestructionParticipationApply_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
