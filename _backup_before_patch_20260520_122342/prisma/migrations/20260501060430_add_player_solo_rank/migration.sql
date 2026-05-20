-- CreateTable
CREATE TABLE "PlayerRiotAccount" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "summonerId" TEXT,
    "accountId" TEXT,
    "profileIconId" INTEGER,
    "summonerLevel" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRiotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSoloRankSnapshot" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "queueType" TEXT NOT NULL DEFAULT 'RANKED_SOLO_5x5',
    "tier" TEXT,
    "rank" TEXT,
    "leaguePoints" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSoloRankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSoloMatch" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "matchId" TEXT NOT NULL,
    "queueId" INTEGER NOT NULL DEFAULT 420,
    "championId" INTEGER NOT NULL,
    "championName" TEXT NOT NULL,
    "position" TEXT,
    "role" TEXT,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "win" BOOLEAN NOT NULL,
    "gameDuration" INTEGER NOT NULL,
    "gameCreation" TIMESTAMP(3) NOT NULL,
    "summonerSpell1" INTEGER,
    "summonerSpell2" INTEGER,
    "primaryRuneId" INTEGER,
    "subRuneId" INTEGER,
    "item0" INTEGER,
    "item1" INTEGER,
    "item2" INTEGER,
    "item3" INTEGER,
    "item4" INTEGER,
    "item5" INTEGER,
    "item6" INTEGER,
    "totalDamageDealtToChampions" INTEGER NOT NULL DEFAULT 0,
    "totalDamageTaken" INTEGER NOT NULL DEFAULT 0,
    "visionScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSoloMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRiotAccount_playerId_key" ON "PlayerRiotAccount"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRiotAccount_puuid_key" ON "PlayerRiotAccount"("puuid");

-- CreateIndex
CREATE INDEX "PlayerRiotAccount_gameName_tagLine_idx" ON "PlayerRiotAccount"("gameName", "tagLine");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSoloRankSnapshot_playerId_key" ON "PlayerSoloRankSnapshot"("playerId");

-- CreateIndex
CREATE INDEX "PlayerSoloMatch_playerId_idx" ON "PlayerSoloMatch"("playerId");

-- CreateIndex
CREATE INDEX "PlayerSoloMatch_championId_idx" ON "PlayerSoloMatch"("championId");

-- CreateIndex
CREATE INDEX "PlayerSoloMatch_gameCreation_idx" ON "PlayerSoloMatch"("gameCreation");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSoloMatch_playerId_matchId_key" ON "PlayerSoloMatch"("playerId", "matchId");

-- AddForeignKey
ALTER TABLE "PlayerRiotAccount" ADD CONSTRAINT "PlayerRiotAccount_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSoloRankSnapshot" ADD CONSTRAINT "PlayerSoloRankSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSoloMatch" ADD CONSTRAINT "PlayerSoloMatch_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
