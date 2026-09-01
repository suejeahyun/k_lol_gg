import type { HomeRepository } from "./ports/home-repository";

export function createLoadHomeSnapshot(repository: HomeRepository) {
  return () => repository.load();
}
