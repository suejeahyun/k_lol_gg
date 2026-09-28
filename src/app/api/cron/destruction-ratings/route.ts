import { getDatabase } from "@/platform/db/client";
import { handleAutomaticRatingCron } from "@/modules/competitions/destruction/automatic-rating-cron";
import { runAutomaticRatingStep } from "@/modules/competitions/destruction/automatic-rating-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleAutomaticRatingCron(request, { secret: process.env.CRON_SECRET, step: () => runAutomaticRatingStep(getDatabase()) });
}
