import type { PlayerRepository } from "./ports/player-repository";

export function createGetPlayerProfile(repository: PlayerRepository) {
  return (id: string) => repository.findById(id);
}
