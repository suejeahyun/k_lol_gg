-- Event / Destruction tournament workflow rework
-- Safe additive migration. Existing columns such as description/recruit dates are retained for history.

ALTER TYPE "ParticipationApplyStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "ParticipationApplyStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ParticipationApplyStatus" ADD VALUE IF NOT EXISTS 'RESERVE';

ALTER TYPE "DestructionStatus" ADD VALUE IF NOT EXISTS 'AUCTION';

DO $$ BEGIN
  CREATE TYPE "DestructionPreliminaryFormat" AS ENUM (
    'FULL_ROUND_ROBIN_BO3',
    'FULL_ROUND_ROBIN_BO1',
    'GROUP_ROUND_ROBIN_BO3',
    'GROUP_ROUND_ROBIN_BO1',
    'SWISS_ROUND_BO3',
    'SWISS_ROUND_BO1',
    'RANDOM_ROUNDS_BO3',
    'RANDOM_ROUNDS_BO1'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DestructionAuctionStatus" AS ENUM (
    'PENDING',
    'DRAWN',
    'SOLD',
    'HOLD',
    'ASSIGNED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "DestructionTournament"
  ADD COLUMN IF NOT EXISTS "preliminaryFormat" "DestructionPreliminaryFormat" NOT NULL DEFAULT 'FULL_ROUND_ROBIN_BO3',
  ADD COLUMN IF NOT EXISTS "preliminaryBestOf" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "preliminaryRoundCount" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "advanceTeamCount" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "DestructionTeam"
  ADD COLUMN IF NOT EXISTS "initialAuctionPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remainingAuctionPoints" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DestructionParticipant"
  ADD COLUMN IF NOT EXISTS "isCaptain" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auctionStatus" "DestructionAuctionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "purchasePoint" INTEGER,
  ADD COLUMN IF NOT EXISTS "drawOrder" INTEGER,
  ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);

ALTER TABLE "DestructionMatch"
  ADD COLUMN IF NOT EXISTS "bestOf" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "teamAScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "teamBScore" INTEGER NOT NULL DEFAULT 0;

UPDATE "DestructionParticipant" dp
SET "isCaptain" = true,
    "auctionStatus" = 'SOLD'
FROM "DestructionTeam" dt
WHERE dp."tournamentId" = dt."tournamentId"
  AND dp."playerId" = dt."captainId";

ALTER TABLE "EventMatch" ALTER COLUMN "status" SET DEFAULT 'RECRUITING';
ALTER TABLE "DestructionTournament" ALTER COLUMN "status" SET DEFAULT 'RECRUITING';
