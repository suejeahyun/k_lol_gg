import { getDatabase } from "@/platform/db/client";
import { PostgresStatisticsProjectionRepository } from "@/modules/statistics/infrastructure/postgres-statistics-projection-repository";
import { handleStatisticsProjectionCron } from "@/modules/statistics/infrastructure/statistics-projection-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleStatisticsProjectionCron(request, {
    secret: process.env.CRON_SECRET,
    getRepository: () => new PostgresStatisticsProjectionRepository(getDatabase()),
  });
}
