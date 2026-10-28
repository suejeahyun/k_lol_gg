import "server-only";

import { eq } from "drizzle-orm";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { getDatabase } from "@/platform/db/client";
import { communitySiteRuntimeConfiguration } from "@/platform/db/schema/community-sites";
import { validateCommunitySiteConfig, type CommunitySiteConfig } from "../domain/site-configuration";

export type RuntimeCommunitySiteConfiguration = Readonly<{
  communityId: string;
  revision: number;
  ownerUserAccountId: string;
  publicationState: "AWAITING_OWNER" | "ACTIVE";
  configuration: CommunitySiteConfig;
}>;

/** No process cache: publishing and revocation must be observed by the next request. */
export async function readRuntimeCommunitySiteConfiguration(): Promise<RuntimeCommunitySiteConfiguration | null> {
  if (SERVICE_BRAND.id !== "community") return null;
  try {
    const [row] = await getDatabase().select().from(communitySiteRuntimeConfiguration).where(eq(communitySiteRuntimeConfiguration.id, 1)).limit(1);
    if (!row || row.communityId !== SERVICE_BRAND.communityId || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("Invalid managed community identity.");
    if (!row.ownerUserAccountId || !["AWAITING_OWNER", "ACTIVE"].includes(row.publicationState)) throw new Error("Invalid managed publication state.");
    return { communityId: row.communityId, revision: row.revision, ownerUserAccountId: row.ownerUserAccountId, publicationState: row.publicationState, configuration: validateCommunitySiteConfig(row.configurationJson) };
  } catch {
    // Do not expose database errors, connection strings, or another community's metadata.
    throw new Error("COMMUNITY_SITE_CONFIGURATION_UNAVAILABLE");
  }
}
