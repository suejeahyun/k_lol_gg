-- CreateTable
CREATE TABLE "PlayerRiotSnapshot" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "puuid" TEXT,
    "summonerId" TEXT,
    "gameName" TEXT,
    "tagLine" TEXT,
    "summonerLevel" INTEGER,
    "soloTier" TEXT,
    "soloRank" TEXT,
    "soloLp" INTEGER,
    "soloWins" INTEGER,
    "soloLosses" INTEGER,
    "soloWinRate" INTEGER,
    "flexTier" TEXT,
    "flexRank" TEXT,
    "flexLp" INTEGER,
    "flexWins" INTEGER,
    "flexLosses" INTEGER,
    "flexWinRate" INTEGER,
    "totalAnalyzedMatches" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRiotSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRiotChampionSnapshot" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "championKey" TEXT NOT NULL,
    "championName" TEXT NOT NULL,
    "championImageUrl" TEXT,
    "games" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalDeaths" INTEGER NOT NULL DEFAULT 0,
    "totalAssists" INTEGER NOT NULL DEFAULT 0,
    "avgKills" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDeaths" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAssists" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kda" TEXT,
    "avgDamageDealtToChampions" INTEGER NOT NULL DEFAULT 0,
    "avgDamageTaken" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRiotChampionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRiotSnapshot_playerId_key" ON "PlayerRiotSnapshot"("playerId");

-- CreateIndex
CREATE INDEX "PlayerRiotChampionSnapshot_snapshotId_idx" ON "PlayerRiotChampionSnapshot"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRiotChampionSnapshot_snapshotId_championKey_key" ON "PlayerRiotChampionSnapshot"("snapshotId", "championKey");

-- AddForeignKey
ALTER TABLE "PlayerRiotSnapshot" ADD CONSTRAINT "PlayerRiotSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRiotChampionSnapshot" ADD CONSTRAINT "PlayerRiotChampionSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerRiotSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
