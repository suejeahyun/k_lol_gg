import type { PlayerCatalogQuery } from "../domain/player";
import type { PlayerRepository } from "./ports/player-repository";

export function createListPlayers(repository: PlayerRepository) {
  return (query: PlayerCatalogQuery) => repository.getCatalog(query);
}
