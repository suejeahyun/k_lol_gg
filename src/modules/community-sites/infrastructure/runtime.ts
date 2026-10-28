import "server-only";
import { getDatabase } from "@/platform/db/client";
import { PostgresCommunitySitesRepository } from "./postgres-community-sites-repository";
import { isCommunitySitesEnabled } from "./runtime-policy";
import { readProvisioningEnvironment } from "./vercel-neon-provisioning-provider";
export { isCommunitySitesEnabled } from "./runtime-policy";

export function getRuntimeCommunitySitesRepository() {
  if (!isCommunitySitesEnabled()) return null;
  try { return new PostgresCommunitySitesRepository(getDatabase()); } catch { return null; }
}

/** Local configuration readiness only; provider permissions, quotas and health are verified during the job. */
export function isCommunitySiteProvisioningReady(): boolean {
  if (!isCommunitySitesEnabled()) return false;
  try { readProvisioningEnvironment(); return true; } catch { return false; }
}
