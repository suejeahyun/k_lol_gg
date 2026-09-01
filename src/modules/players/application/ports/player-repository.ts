import type { PlayerSummary } from "../../domain/player";

export interface PlayerRepository {
  search(query: string): Promise<readonly PlayerSummary[]>;
}
