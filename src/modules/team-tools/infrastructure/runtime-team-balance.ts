import "server-only";

import { getDatabase } from "@/platform/db/client";

import { TeamBalanceService } from "../application/team-balance-service";
import { PostgresTeamBalanceRepository } from "./postgres-team-balance-repository";

export function getRuntimeTeamBalanceService() {
  try {
    return new TeamBalanceService(new PostgresTeamBalanceRepository(getDatabase()));
  } catch {
    return null;
  }
}

export async function loadRuntimeTeamBalance<T>(loader: (service: TeamBalanceService) => Promise<T>) {
  const service = getRuntimeTeamBalanceService();
  if (!service) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(service) };
  } catch {
    return { state: "error" as const };
  }
}
