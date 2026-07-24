ALTER TABLE "RecruitParty"
  ADD COLUMN IF NOT EXISTS "requestKey" TEXT;

ALTER TABLE "DestructionScrimRecruit"
  ADD COLUMN IF NOT EXISTS "requestKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "RecruitParty_requestKey_unique"
  ON "RecruitParty"("requestKey");

CREATE UNIQUE INDEX IF NOT EXISTS "ScrimRecruit_requestKey_unique"
  ON "DestructionScrimRecruit"("requestKey");

WITH ranked_source_hashes AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "recruitDate", "sourceMessageHash"
      ORDER BY "id" ASC
    ) AS duplicate_rank
  FROM "DestructionScrimRecruit"
  WHERE "sourceMessageHash" IS NOT NULL
)
UPDATE "DestructionScrimRecruit" AS scrim
SET "sourceMessageHash" = NULL
FROM ranked_source_hashes AS ranked
WHERE scrim."id" = ranked."id"
  AND ranked.duplicate_rank > 1;

DROP INDEX IF EXISTS "DestructionScrimRecruit_sourceMessageHash_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ScrimRecruit_date_sourceHash_unique"
  ON "DestructionScrimRecruit"("recruitDate", "sourceMessageHash");
