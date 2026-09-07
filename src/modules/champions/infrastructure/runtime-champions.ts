import "server-only";

import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { getDatabase } from "@/platform/db/client";

import { ChampionQueryService } from "../application/query-service";
import { ChampionCommandHandler } from "../application/command-handler";
import { PostgresChampionAdapter } from "./postgres-champion-adapter";
import { PostgresChampionQueryRepository } from "./postgres-champion-query-repository";

function queryService() {
  return new ChampionQueryService(new PostgresChampionQueryRepository(getDatabase()));
}

export function getRuntimePublicChampionQueryService() {
  if (process.env.V2_PUBLIC_DATA_SOURCE !== "postgres" || !process.env.DATABASE_URL) return null;
  try { return queryService(); } catch { return null; }
}

export function getRuntimeAdminChampionQueryService() {
  const auth = resolveRuntimeAuthContext();
  if (!auth || auth.mode !== "database") return null;
  try { return queryService(); } catch { return null; }
}

export function getRuntimeChampionCommandHandler() {
  const auth = resolveRuntimeAuthContext();
  if (!auth || auth.mode !== "database") return null;
  try {
    const adapter = new PostgresChampionAdapter(getDatabase());
    return new ChampionCommandHandler(adapter.dependencies());
  } catch { return null; }
}

export async function loadRuntimeChampions<T>(admin: boolean, loader: (service: ChampionQueryService) => Promise<T>) {
  const service = admin ? getRuntimeAdminChampionQueryService() : getRuntimePublicChampionQueryService();
  if (!service) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(service) }; }
  catch { return { state: "error" as const }; }
}
