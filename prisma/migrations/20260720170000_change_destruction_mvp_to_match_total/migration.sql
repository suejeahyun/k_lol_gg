ALTER TABLE "DestructionMatch"
  ADD COLUMN "mvpSelectionMethod" "DestructionMvpSelectionMethod",
  ADD COLUMN "mvpFinalizedAt" TIMESTAMP(3);

CREATE TABLE "DestructionMatchMvpVote" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "voterUserAccountId" INTEGER NOT NULL,
  "candidatePlayerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestructionMatchMvpVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestructionMatchMvpVote_matchId_voterUserAccountId_key" ON "DestructionMatchMvpVote"("matchId", "voterUserAccountId");
CREATE INDEX "DestructionMatchMvpVote_matchId_candidatePlayerId_idx" ON "DestructionMatchMvpVote"("matchId", "candidatePlayerId");
CREATE INDEX "DestructionMatchMvpVote_voterUserAccountId_idx" ON "DestructionMatchMvpVote"("voterUserAccountId");

ALTER TABLE "DestructionMatchMvpVote" ADD CONSTRAINT "DestructionMatchMvpVote_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "DestructionMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionMatchMvpVote" ADD CONSTRAINT "DestructionMatchMvpVote_voterUserAccountId_fkey" FOREIGN KEY ("voterUserAccountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionMatchMvpVote" ADD CONSTRAINT "DestructionMatchMvpVote_candidatePlayerId_fkey" FOREIGN KEY ("candidatePlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionMatch" ADD CONSTRAINT "DestructionMatch_mvpPlayerId_fkey" FOREIGN KEY ("mvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "DestructionMatch"
SET "mvpSelectionMethod" = 'ADMIN', "mvpFinalizedAt" = CURRENT_TIMESTAMP
WHERE "mvpPlayerId" IS NOT NULL;

DROP TABLE "DestructionMvpVote";
DROP TABLE "DestructionGame";
