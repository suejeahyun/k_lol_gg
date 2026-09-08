import "server-only";

import { getDatabase } from "@/platform/db/client";
import { loadRuntimeChampions } from "@/modules/champions/infrastructure/runtime-champions";

import { createLoadHomeSnapshot } from "../application/load-home-snapshot";
import {
  kstHomeDateKey,
  selectDailyHomeChampion,
  type HomeDailyChampionSelection,
  type HomeSnapshotResult,
} from "../domain/home-snapshot";
import { PostgresHomeRepository } from "./postgres-home-repository";

function postgresModeEnabled(): boolean {
  return process.env.V2_PUBLIC_DATA_SOURCE === "postgres" && Boolean(process.env.DATABASE_URL);
}
export async function loadRuntimeHomeSnapshot(): Promise<HomeSnapshotResult> {
  if (!postgresModeEnabled()) return { state: "unavailable" };

  try {
    const repository = new PostgresHomeRepository(getDatabase());
    const snapshot = await createLoadHomeSnapshot(repository)();
    return { state: "ready", snapshot };
  } catch {
    return { state: "error" };
  }
}

export async function loadRuntimeDailyHomeChampion(
  now = new Date(),
): Promise<
  | Readonly<{ state: "ready"; data: HomeDailyChampionSelection }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>
> {
  const dateKey = kstHomeDateKey(now);
  return loadRuntimeChampions(false, async (service) => {
    const pageSize = 100;
    const firstPage = await service.listPublic({ query: null, status: "ACTIVE", page: 1, pageSize });
    const pageCount = Math.ceil(firstPage.total / pageSize);
    if (pageCount > 1_000) throw new Error("HOME_CHAMPION_CATALOG_TOO_LARGE");
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => (
        service.listPublic({ query: null, status: "ACTIVE", page: index + 2, pageSize })
      )),
    );
    return selectDailyHomeChampion(
      [firstPage, ...remainingPages].flatMap((page) => page.items),
      dateKey,
    );
  });
}
