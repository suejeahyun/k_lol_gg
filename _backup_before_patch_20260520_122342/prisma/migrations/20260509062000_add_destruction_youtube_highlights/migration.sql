CREATE TABLE "DestructionYoutubeHighlight" (
  "id" SERIAL NOT NULL,
  "tournamentId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "youtubeUrl" TEXT NOT NULL,
  "youtubeVideoId" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DestructionYoutubeHighlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DestructionYoutubeHighlight_tournamentId_sortOrder_idx"
ON "DestructionYoutubeHighlight"("tournamentId", "sortOrder");

CREATE INDEX "DestructionYoutubeHighlight_youtubeVideoId_idx"
ON "DestructionYoutubeHighlight"("youtubeVideoId");

ALTER TABLE "DestructionYoutubeHighlight"
ADD CONSTRAINT "DestructionYoutubeHighlight_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "DestructionTournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
