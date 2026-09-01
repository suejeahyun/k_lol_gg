import type { PlayerRepository } from "./ports/player-repository";

export function createSearchPlayers(repository: PlayerRepository) {
  return function searchPlayers(query: string) {
    return repository.search(query);
  };
}
