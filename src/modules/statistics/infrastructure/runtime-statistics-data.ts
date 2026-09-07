import "server-only";

import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { getDatabase } from "@/platform/db/client";

import { drainStatisticsProjection } from "../application/drain-statistics-projection";
import { StatisticsService } from "../application/statistics-service";
import { PostgresStatisticsProjectionRepository } from "./postgres-statistics-projection-repository";
import { PostgresStatisticsQueryRepository } from "./postgres-statistics-query-repository";

function publicPostgresEnabled(): boolean {
  return process.env.V2_PUBLIC_DATA_SOURCE === "postgres" && Boolean(process.env.DATABASE_URL);
}

export type RuntimeStatisticsData<T> =
  | Readonly<{ state: "ready"; data: T }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;

export function getRuntimePublicStatisticsService(): StatisticsService | null {
  if (!publicPostgresEnabled()) return null;
  try {
    return new StatisticsService(new PostgresStatisticsQueryRepository(getDatabase()));
  } catch {
    return null;
  }
}

export function getRuntimeAdminStatisticsService(): StatisticsService | null {
  const auth = resolveRuntimeAuthContext();
  if (!auth || auth.mode !== "database") return null;
  try {
    const database = getDatabase();
    return new StatisticsService(
      new PostgresStatisticsQueryRepository(database),
      new PostgresStatisticsProjectionRepository(database),
    );
  } catch {
    return null;
  }
}

export async function loadRuntimeStatisticsData<T>(
  loader: (service: StatisticsService) => Promise<T>,
): Promise<RuntimeStatisticsData<T>> {
  const service = getRuntimePublicStatisticsService();
  if (!service) return { state: "unavailable" };
  try {
    return { state: "ready", data: await loader(service) };
  } catch {
    return { state: "error" };
  }
}

export async function loadRuntimeAdminStatisticsData<T>(
  loader: (service: StatisticsService) => Promise<T>,
): Promise<RuntimeStatisticsData<T>> {
  const service = getRuntimeAdminStatisticsService();
  if (!service) return { state: "unavailable" };
  try {
    return { state: "ready", data: await loader(service) };
  } catch {
    return { state: "error" };
  }
}

/** Explicit local/CI boundary only. No route or scheduler calls this function. */
export async function drainLocalRuntimeStatistics(maximumEvents: number) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.V2_ALLOW_LOCAL_STATISTICS_DRAIN !== "true" ||
    !process.env.DATABASE_URL
  ) {
    throw new Error("LOCAL_STATISTICS_DRAIN_DISABLED");
  }
  return drainStatisticsProjection(
    new PostgresStatisticsProjectionRepository(getDatabase()),
    { maximumEvents },
  );
}
