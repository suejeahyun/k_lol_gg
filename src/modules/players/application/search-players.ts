import { findFixturePlayers } from "../infrastructure/fixture-player-repository";

export async function searchPlayers(query: string) {
  return findFixturePlayers(query);
}
