import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { handleRiotSyncCron } from "@/modules/riot/infrastructure/riot-sync-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleRiotSyncCron(request, { cronSecret: process.env.CRON_SECRET, jobSecret: process.env.OPERATIONS_JOB_SECRET,
    getService: () => getRuntimeRiot()?.service ?? null });
}
