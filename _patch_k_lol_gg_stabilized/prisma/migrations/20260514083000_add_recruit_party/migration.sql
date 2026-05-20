CREATE TYPE "RecruitPartyType" AS ENUM ('FLEX_RANK', 'NORMAL_GAME', 'SOLO_RANK', 'ARAM', 'OTHER_GAME');
CREATE TYPE "RecruitPartyStatus" AS ENUM ('IN_PROGRESS', 'CANCELED');

CREATE TABLE "RecruitParty" (
  "id" SERIAL NOT NULL,
  "recruitNo" INTEGER NOT NULL,
  "type" "RecruitPartyType" NOT NULL,
  "status" "RecruitPartyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "title" TEXT NOT NULL,
  "roomName" TEXT,
  "hostName" TEXT,
  "startTimeText" TEXT,
  "playStyle" TEXT,
  "note" TEXT,
  "maxMembers" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruitParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruitPartyMember" (
  "id" SERIAL NOT NULL,
  "partyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "position" TEXT,
  "slotNo" INTEGER,
  "isSubstitute" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecruitPartyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruitPartyLog" (
  "id" SERIAL NOT NULL,
  "recruitNo" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "memberCount" INTEGER NOT NULL,
  "maxMembers" INTEGER NOT NULL,
  "summary" TEXT,
  "roomName" TEXT,
  "sender" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecruitPartyLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruitParty_recruitNo_key" ON "RecruitParty"("recruitNo");
CREATE INDEX "RecruitParty_type_idx" ON "RecruitParty"("type");
CREATE INDEX "RecruitParty_status_updatedAt_idx" ON "RecruitParty"("status", "updatedAt");
CREATE INDEX "RecruitParty_createdAt_idx" ON "RecruitParty"("createdAt");
CREATE UNIQUE INDEX "RecruitPartyMember_partyId_position_key" ON "RecruitPartyMember"("partyId", "position");
CREATE UNIQUE INDEX "RecruitPartyMember_partyId_slotNo_isSubstitute_key" ON "RecruitPartyMember"("partyId", "slotNo", "isSubstitute");
CREATE INDEX "RecruitPartyMember_partyId_idx" ON "RecruitPartyMember"("partyId");
CREATE INDEX "RecruitPartyLog_recruitNo_idx" ON "RecruitPartyLog"("recruitNo");
CREATE INDEX "RecruitPartyLog_action_createdAt_idx" ON "RecruitPartyLog"("action", "createdAt");
CREATE INDEX "RecruitPartyLog_createdAt_idx" ON "RecruitPartyLog"("createdAt");

ALTER TABLE "RecruitPartyMember"
  ADD CONSTRAINT "RecruitPartyMember_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "RecruitParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
