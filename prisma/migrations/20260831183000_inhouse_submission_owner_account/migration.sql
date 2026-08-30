-- Store the web submission owner in a relational column. The legacy JSON value
-- remains in parsedData during the compatibility window.
ALTER TABLE "InhouseResultSubmission"
ADD COLUMN "submittedByUserAccountId" INTEGER;

-- Backfill only valid WEB owners that still exist. Invalid or deleted legacy
-- values intentionally remain NULL and continue through the guarded fallback.
UPDATE "InhouseResultSubmission" AS submission
SET "submittedByUserAccountId" = legacy."ownerId"
FROM (
  SELECT source."id" AS "submissionId", account."id" AS "ownerId"
  FROM "InhouseResultSubmission" AS source
  INNER JOIN "UserAccount" AS account
    ON account."id"::TEXT = (source."parsedData" ->> 'submittedByUserAccountId')
  WHERE source."roomName" = 'WEB'
    AND (source."parsedData" ->> 'submittedByUserAccountId') ~ '^[1-9][0-9]*$'
) AS legacy
WHERE submission."id" = legacy."submissionId";

CREATE INDEX "InhouseResultSubmission_owner_status_updated_idx"
ON "InhouseResultSubmission"("submittedByUserAccountId", "status", "updatedAt");

ALTER TABLE "InhouseResultSubmission"
ADD CONSTRAINT "InhouseResultSubmission_submittedByUserAccountId_fkey"
FOREIGN KEY ("submittedByUserAccountId") REFERENCES "UserAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
