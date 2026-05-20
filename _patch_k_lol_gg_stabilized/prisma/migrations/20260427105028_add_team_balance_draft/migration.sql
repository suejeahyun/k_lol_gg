-- CreateTable
CREATE TABLE "TeamBalanceDraft" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "seasonId" INTEGER,
    "applyDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamBalanceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamBalanceDraftPlayer" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "team" "Team" NOT NULL,
    "position" "Position" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamBalanceDraftPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamBalanceDraftPlayer_draftId_playerId_key" ON "TeamBalanceDraftPlayer"("draftId", "playerId");

-- AddForeignKey
ALTER TABLE "TeamBalanceDraft" ADD CONSTRAINT "TeamBalanceDraft_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamBalanceDraftPlayer" ADD CONSTRAINT "TeamBalanceDraftPlayer_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TeamBalanceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamBalanceDraftPlayer" ADD CONSTRAINT "TeamBalanceDraftPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
