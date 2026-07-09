ALTER TABLE "DestructionScrimRecruit"
  ADD COLUMN IF NOT EXISTS "requesterLineupJson" JSONB,
  ADD COLUMN IF NOT EXISTS "opponentLineupJson" JSONB,
  ADD COLUMN IF NOT EXISTS "seriesRuleText" TEXT;
