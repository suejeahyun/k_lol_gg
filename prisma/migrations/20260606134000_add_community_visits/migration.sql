CREATE TABLE IF NOT EXISTS "CommunityVisit" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "visitDate" TIMESTAMP(3) NOT NULL,
  "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommunityVisit_userId_visitDate_key" ON "CommunityVisit"("userId", "visitDate");
CREATE INDEX IF NOT EXISTS "CommunityVisit_visitDate_visitedAt_idx" ON "CommunityVisit"("visitDate", "visitedAt");

DO $$ BEGIN
  ALTER TABLE "CommunityVisit"
    ADD CONSTRAINT "CommunityVisit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
