import type { HomeSnapshot } from "../../domain/home-snapshot";

export interface HomeRepository {
  load(): Promise<HomeSnapshot>;
}
