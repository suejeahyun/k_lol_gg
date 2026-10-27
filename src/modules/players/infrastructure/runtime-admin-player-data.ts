import "server-only";
import { configuredRuntimeDatabaseUrl } from "@/platform/db/runtime-database-url";

import { getDatabase } from "@/platform/db/client";

import type { AdminPlayerListQuery, AdminPlayerDataResult, AdminPlayer, AdminPlayerPage } from "../domain/admin-player";
import { PostgresAdminPlayerRepository } from "./postgres-admin-player-repository";

function runtimeRepository(): PostgresAdminPlayerRepository | null {
  return configuredRuntimeDatabaseUrl()
    ? new PostgresAdminPlayerRepository(getDatabase())
    : null;
}

export function getRuntimeAdminPlayerRepository(): PostgresAdminPlayerRepository | null {
  try {
    return runtimeRepository();
  } catch {
    return null;
  }
}

export async function loadRuntimeAdminPlayers(
  query: AdminPlayerListQuery,
): Promise<AdminPlayerDataResult<AdminPlayerPage>> {
  const repository = getRuntimeAdminPlayerRepository();
  if (!repository) return { state: "unavailable" };
  try {
    return { state: "ready", data: await repository.list(query) };
  } catch {
    return { state: "error" };
  }
}

export async function loadRuntimeAdminPlayer(
  id: string,
): Promise<AdminPlayerDataResult<AdminPlayer | null>> {
  const repository = getRuntimeAdminPlayerRepository();
  if (!repository) return { state: "unavailable" };
  try {
    return { state: "ready", data: await repository.findById(id) };
  } catch {
    return { state: "error" };
  }
}
