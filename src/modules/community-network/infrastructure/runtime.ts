import "server-only";
import { getDatabase } from "@/platform/db/client";
import { PostgresCommunityNetworkRepository } from "./postgres-community-network-repository";
import { isCommunityNetworkEnabled } from "./runtime-policy";

export { isCommunityNetworkEnabled } from "./runtime-policy";

export function getRuntimeCommunityNetworkRepository() {
  if (!isCommunityNetworkEnabled()) return null;
  try { return new PostgresCommunityNetworkRepository(getDatabase()); } catch { return null; }
}

export async function loadRuntimeCommunityNetwork<T>(loader: (repository: PostgresCommunityNetworkRepository) => Promise<T>) {
  if (!isCommunityNetworkEnabled()) return { state: "disabled" as const };
  const repository = getRuntimeCommunityNetworkRepository();
  if (!repository) return { state: "unavailable" as const };
  try { return { state: "ready" as const, data: await loader(repository) }; }
  catch { return { state: "error" as const }; }
}
