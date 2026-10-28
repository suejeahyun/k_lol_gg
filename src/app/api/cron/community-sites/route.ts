import { getDatabase } from "@/platform/db/client";
import { handleCommunitySitesCron } from "@/modules/community-sites/infrastructure/community-sites-cron";
import { isCommunitySitesEnabled } from "@/modules/community-sites/infrastructure/runtime-policy";
import { runNextCommunitySiteProvisioningJob } from "@/modules/community-sites/infrastructure/provisioning-worker";
import { createVercelNeonProvisioningProvider } from "@/modules/community-sites/infrastructure/vercel-neon-provisioning-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;
export const preferredRegion = "sin1";
export async function GET(request: Request) {
  return handleCommunitySitesCron(request, { enabled: isCommunitySitesEnabled(), secret: process.env.CRON_SECRET,
    run: async () => {
      const database = getDatabase();
      return runNextCommunitySiteProvisioningJob(database, createVercelNeonProvisioningProvider(database));
    },
  });
}
