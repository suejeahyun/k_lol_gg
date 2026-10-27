import "server-only";
import { configuredRuntimeDatabaseUrl } from "@/platform/db/runtime-database-url";

import { getDatabase } from "@/platform/db/client";

import { createGetPlayerProfile } from "../application/get-player-profile";
import { createListPlayers } from "../application/list-players";
import type { PlayerCatalogPage, PlayerCatalogQuery, PlayerDataResult, PlayerProfile } from "../domain/player";
import { PostgresPlayerRepository } from "./postgres-player-repository";

function postgresModeEnabled(): boolean {
  return process.env.V2_PUBLIC_DATA_SOURCE === "postgres" && Boolean(configuredRuntimeDatabaseUrl());
}

function runtimeRepository(): PostgresPlayerRepository | null {
  return postgresModeEnabled() ? new PostgresPlayerRepository(getDatabase()) : null;
}

export async function loadRuntimePlayerCatalog(
  query: PlayerCatalogQuery,
): Promise<PlayerDataResult<PlayerCatalogPage>> {
  const repository = runtimeRepository();
  if (!repository) return { state: "unavailable" };

  try {
    return { state: "ready", data: await createListPlayers(repository)(query) };
  } catch {
    return { state: "error" };
  }
}

export async function loadRuntimePlayerProfile(
  id: string,
): Promise<PlayerDataResult<PlayerProfile | null>> {
  const repository = runtimeRepository();
  if (!repository) return { state: "unavailable" };

  try {
    return { state: "ready", data: await createGetPlayerProfile(repository)(id) };
  } catch {
    return { state: "error" };
  }
}
