import { handleMmrProjectionCron } from "@/modules/mmr/infrastructure/mmr-projection-cron";
import { getRuntimeMmrService } from "@/modules/mmr/infrastructure/runtime-mmr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleMmrProjectionCron(request, {
    secret: process.env.CRON_SECRET,
    getService: getRuntimeMmrService,
  });
}
