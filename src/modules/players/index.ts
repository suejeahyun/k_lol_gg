import { normalizePlayerQuery } from "./application/normalize-player-query";
import { createSearchPlayers } from "./application/search-players";
import { fixturePlayerRepository } from "./infrastructure/fixture-player-repository";
import { PlayerResultCard } from "./ui/player-result-card";

const searchPlayers = createSearchPlayers(fixturePlayerRepository);

export { normalizePlayerQuery, PlayerResultCard, searchPlayers };
