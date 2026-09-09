import { isPublicRiotPlayerId } from "@/modules/riot/application/riot-query";
import { loadRuntimePublicRiotProfile } from "@/modules/riot/infrastructure/runtime-riot";
import { riotInvalidInputResponse, riotNotFoundResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return riotInvalidInputResponse(traceId);
  const { playerId } = await context.params;
  if (!isPublicRiotPlayerId(playerId)) return riotInvalidInputResponse(traceId);
  const result = await loadRuntimePublicRiotProfile(playerId);
  if (result.state !== "ready") return riotUnavailableResponse(traceId);
  if (result.data.kind === "PLAYER_NOT_FOUND") return riotNotFoundResponse(traceId);
  return riotReadResponse({ state: result.data, summary: "summary" in result.data ? result.data.summary : null }, undefined, traceId);
}
