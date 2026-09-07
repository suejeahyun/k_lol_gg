import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { riotInvalidInputResponse, riotNotFoundResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return riotInvalidInputResponse(traceId);
  const runtime = getRuntimeRiot();
  if (!runtime) return riotUnavailableResponse(traceId);
  try {
    const summary = await runtime.query.getPublicSummary((await context.params).playerId);
    return summary ? riotReadResponse({ summary }, undefined, traceId) : riotNotFoundResponse(traceId);
  } catch { return riotUnavailableResponse(traceId); }
}
