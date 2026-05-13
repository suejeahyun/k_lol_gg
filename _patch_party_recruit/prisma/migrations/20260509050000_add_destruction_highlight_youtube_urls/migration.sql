ALTER TABLE "DestructionTournament"
ADD COLUMN "highlightYoutubeUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
