CREATE TABLE "DestructionParticipantReplacement" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "participantId" INTEGER NOT NULL,
    "outgoingPlayerId" INTEGER NOT NULL,
    "incomingPlayerId" INTEGER NOT NULL,
    "outgoingPosition" "Position" NOT NULL,
    "incomingPosition" "Position" NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestructionParticipantReplacement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DestructionParticipantReplacement_tournamentId_effectiveAt_idx"
ON "DestructionParticipantReplacement"("tournamentId", "effectiveAt");

CREATE INDEX "DestructionParticipantReplacement_participantId_idx"
ON "DestructionParticipantReplacement"("participantId");

CREATE INDEX "DestructionParticipantReplacement_outgoingPlayerId_idx"
ON "DestructionParticipantReplacement"("outgoingPlayerId");

CREATE INDEX "DestructionParticipantReplacement_incomingPlayerId_idx"
ON "DestructionParticipantReplacement"("incomingPlayerId");

ALTER TABLE "DestructionParticipantReplacement"
ADD CONSTRAINT "DestructionParticipantReplacement_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DestructionParticipantReplacement"
ADD CONSTRAINT "DestructionParticipantReplacement_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "DestructionTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DestructionParticipantReplacement"
ADD CONSTRAINT "DestructionParticipantReplacement_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "DestructionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DestructionParticipantReplacement"
ADD CONSTRAINT "DestructionParticipantReplacement_outgoingPlayerId_fkey"
FOREIGN KEY ("outgoingPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DestructionParticipantReplacement"
ADD CONSTRAINT "DestructionParticipantReplacement_incomingPlayerId_fkey"
FOREIGN KEY ("incomingPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
