-- Connect saved team balance drafts to registered in-house matches.
ALTER TABLE "MatchSeries" ADD COLUMN IF NOT EXISTS "teamBalanceDraftId" INTEGER;

DO $$
BEGIN
  ALTER TABLE "MatchSeries"
    ADD CONSTRAINT "MatchSeries_teamBalanceDraftId_fkey"
    FOREIGN KEY ("teamBalanceDraftId")
    REFERENCES "TeamBalanceDraft"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "MatchSeries_teamBalanceDraftId_idx"
  ON "MatchSeries"("teamBalanceDraftId");
