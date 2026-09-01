import type {
  PlayerCatalogPage,
  PlayerCatalogQuery,
  PlayerProfile,
  PlayerSummary,
} from "../../domain/player";

export interface PlayerRepository {
  search(query: string): Promise<readonly PlayerSummary[]>;
  getCatalog(query: PlayerCatalogQuery): Promise<PlayerCatalogPage>;
  findById(id: string): Promise<PlayerProfile | null>;
}
