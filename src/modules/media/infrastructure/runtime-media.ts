import "server-only";

import { PublicPrivateAssetService } from "@/modules/assets/application/public-private-asset-service";
import { PostgresPublicPrivateAssetRepository } from "@/modules/assets/infrastructure/postgres-public-private-asset-repository";
import { getRuntimePrivateAdapters } from "@/modules/matches/infrastructure/runtime-private-assets";
import { getDatabase } from "@/platform/db/client";

import { MediaService } from "../application/media-service";
import { PostgresMediaRepository } from "./postgres-media-repository";

export function getRuntimeMediaService() {
  try {
    return new MediaService(new PostgresMediaRepository(getDatabase()));
  } catch {
    return null;
  }
}

export function getRuntimePublishedAssetService() {
  const adapters = getRuntimePrivateAdapters();
  if (!adapters) return null;
  try {
    return new PublicPrivateAssetService(
      new PostgresPublicPrivateAssetRepository(getDatabase()),
      adapters.storage,
    );
  } catch {
    return null;
  }
}

export async function loadRuntimeMedia<T>(loader: (service: MediaService) => Promise<T>) {
  const service = getRuntimeMediaService();
  if (!service) return { state: "unavailable" as const };
  try {
    return { state: "ready" as const, data: await loader(service) };
  } catch {
    return { state: "error" as const };
  }
}
