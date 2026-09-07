import { parseMmrPlayerQuery } from "@/modules/mmr";
import { getRuntimeMmrService } from "@/modules/mmr/infrastructure/runtime-mmr";
import { mmrInvalidInputResponse, mmrReadResponse, mmrUnavailableResponse } from "@/modules/mmr/infrastructure/mmr-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parseMmrPlayerQuery(request.url);
  if (!query) return mmrInvalidInputResponse(traceId);
  const service = getRuntimeMmrService();
  if (!service) return mmrUnavailableResponse(traceId);
  try {
    const [summary, players] = await Promise.all([service.getSummary(), service.listPlayers(query)]);
    return mmrReadResponse({ summary, players }, summary.generation, traceId);
  } catch {
    return mmrUnavailableResponse(traceId);
  }
}
