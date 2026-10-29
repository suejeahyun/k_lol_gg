import "server-only";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { getRuntimeCommunitySitesRepository, isCommunitySitesEnabled } from "@/modules/community-sites/infrastructure/runtime";
import { loadRuntimeCommunityNetwork } from "./runtime";
import { fetchPublicCommunityIntroduction, type HubCommunityIntroductionResult } from "./public-community-introduction-client";

export type HubPublicCommunity = Readonly<{ id: string; slug: string; name: string; origin: string; description: string }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Each repository selects only LISTED/ACTIVE public fields. Lists never contact child sites. */
export async function listHubCommunities(): Promise<{ communities: HubPublicCommunity[]; unavailable: boolean }> {
  if (SERVICE_BRAND.id !== "hub") return { communities: [], unavailable: false };
  const [registered, managed] = await Promise.allSettled([
    loadRuntimeCommunityNetwork((repository) => repository.getPublicDirectory()),
    (async () => {
      const repository = getRuntimeCommunitySitesRepository();
      return repository ? { data: await repository.getPublicSites(), unavailable: false } : { data: [], unavailable: isCommunitySitesEnabled() };
    })(),
  ]);
  const registeredData = registered.status === "fulfilled" && registered.value.state === "ready" ? registered.value.data : [];
  const managedData = managed.status === "fulfilled" ? managed.value.data : [];
  const unavailable = registered.status === "rejected" || (registered.value.state !== "ready" && registered.value.state !== "disabled")
    || managed.status === "rejected" || managed.value.unavailable;
  const seen = new Set<string>(); const communities: HubPublicCommunity[] = [];
  for (const item of [...registeredData, ...managedData]) {
    if (seen.has(item.origin)) continue;
    seen.add(item.origin);
    communities.push({ id: item.id, slug: item.slug, name: item.name, origin: item.origin, description: item.description });
  }
  return { communities, unavailable };
}

export async function findHubCommunity(id: string): Promise<HubPublicCommunity | null> {
  if (!uuid.test(id)) return null;
  const result = await listHubCommunities();
  const community = result.communities.find((item) => item.id === id);
  if (community) return community;
  if (result.unavailable) throw new Error("HUB_DIRECTORY_UNAVAILABLE");
  return null;
}

/** Recheck visibility before the external read so a removed listing cannot be fetched from a stale detail link. */
export async function loadHubCommunityIntroduction(origin: string): Promise<HubCommunityIntroductionResult> {
  const result = await listHubCommunities();
  if (!result.communities.some((item) => item.origin === origin)) return { state: result.unavailable ? "unavailable" : "unpublished" };
  return fetchPublicCommunityIntroduction(origin);
}
