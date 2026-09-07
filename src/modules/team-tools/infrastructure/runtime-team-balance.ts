import "server-only";

import { getDatabase } from "@/platform/db/client";

import { TeamBalanceService } from "../application/team-balance-service";
import { PostgresTeamBalanceRepository } from "./postgres-team-balance-repository";
import { TeamBalanceRecommendationService } from "../application/team-balance-recommendation-service";
import { PostgresTeamBalanceRecommendationRepository } from "./postgres-team-balance-recommendation-repository";

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

export function getRuntimeTeamBalanceRecommendations() {
  try {
    return new TeamBalanceRecommendationService(new PostgresTeamBalanceRecommendationRepository(getDatabase()));
  } catch {
    return null;
  }
}

export async function loadRuntimeTeamBalanceRecommendations<T>(
  loader: (service: TeamBalanceRecommendationService) => Promise<T>,
) {
  const service = getRuntimeTeamBalanceRecommendations();
  if (!service) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(service) };
  } catch {
    return { state: "error" as const };
  }
}
