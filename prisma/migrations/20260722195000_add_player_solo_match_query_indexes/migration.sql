CREATE INDEX "PlayerSoloMatch_playerId_gameCreation_idx"
ON "PlayerSoloMatch"("playerId", "gameCreation");

CREATE INDEX "PlayerSoloMatch_playerId_championId_idx"
ON "PlayerSoloMatch"("playerId", "championId");
