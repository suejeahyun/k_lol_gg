import { getDatabase } from "@/platform/db/client";
import { handleRiotApiProbeRequest } from "@/modules/riot/infrastructure/riot-api-probe-http";
import { runPostgresRiotApiProbe } from "@/modules/riot/infrastructure/postgres-riot-api-probe";
import { readRiotProductionConfiguration } from "@/modules/riot/infrastructure/riot-runtime-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleRiotApiProbeRequest(request, { run: async (input) => {
    const configuration = readRiotProductionConfiguration(process.env);
    if (!configuration) return { status: 503, body: { code: "RIOT_UNCONFIGURED" } };
    return runPostgresRiotApiProbe(input, { database: getDatabase(), configuration });
  } });
}
