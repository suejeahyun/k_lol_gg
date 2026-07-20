CREATE TYPE "DestructionMvpSelectionMethod" AS ENUM ('VOTE', 'ADMIN');

CREATE TABLE "DestructionGame" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "gameNumber" INTEGER NOT NULL,
  "winnerTeamId" INTEGER NOT NULL,
  "mvpPlayerId" INTEGER,
  "mvpSelectionMethod" "DestructionMvpSelectionMethod",
  "mvpFinalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestructionGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DestructionMvpVote" (
  "id" SERIAL NOT NULL,
  "gameId" INTEGER NOT NULL,
  "voterUserAccountId" INTEGER NOT NULL,
  "candidatePlayerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestructionMvpVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestructionGame_matchId_gameNumber_key" ON "DestructionGame"("matchId", "gameNumber");
CREATE INDEX "DestructionGame_matchId_gameNumber_idx" ON "DestructionGame"("matchId", "gameNumber");
CREATE INDEX "DestructionGame_mvpPlayerId_idx" ON "DestructionGame"("mvpPlayerId");
CREATE UNIQUE INDEX "DestructionMvpVote_gameId_voterUserAccountId_key" ON "DestructionMvpVote"("gameId", "voterUserAccountId");
CREATE INDEX "DestructionMvpVote_gameId_candidatePlayerId_idx" ON "DestructionMvpVote"("gameId", "candidatePlayerId");
CREATE INDEX "DestructionMvpVote_voterUserAccountId_idx" ON "DestructionMvpVote"("voterUserAccountId");

INSERT INTO "DestructionGame" ("matchId", "gameNumber", "winnerTeamId", "createdAt", "updatedAt")
SELECT match."id", set_no,
  CASE WHEN set_no <= match."teamAScore" THEN match."teamAId" ELSE match."teamBId" END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "DestructionMatch" AS match
CROSS JOIN LATERAL generate_series(1, match."teamAScore" + match."teamBScore") AS set_no
WHERE match."winnerTeamId" IS NOT NULL;

ALTER TABLE "DestructionGame" ADD CONSTRAINT "DestructionGame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "DestructionMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionGame" ADD CONSTRAINT "DestructionGame_mvpPlayerId_fkey" FOREIGN KEY ("mvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DestructionMvpVote" ADD CONSTRAINT "DestructionMvpVote_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "DestructionGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionMvpVote" ADD CONSTRAINT "DestructionMvpVote_voterUserAccountId_fkey" FOREIGN KEY ("voterUserAccountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DestructionMvpVote" ADD CONSTRAINT "DestructionMvpVote_candidatePlayerId_fkey" FOREIGN KEY ("candidatePlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
