import { isPublicRiotPlayerId } from "@/modules/riot/application/riot-query";
import { parseRiotAnalyticsCursor } from "@/modules/riot/domain/riot-match-normalizer";
import { loadRuntimePublicRiotAnalytics } from "@/modules/riot/infrastructure/runtime-riot";
import { riotInvalidInputResponse, riotNotFoundResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

/** Reads the stored public projection only; browsing never spends Riot API calls. */
export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some((key) => key !== "cursor") || query.getAll("cursor").length > 1) return riotInvalidInputResponse(traceId);
  const cursor = query.get("cursor");
  if (cursor !== null && !parseRiotAnalyticsCursor(cursor)) return riotInvalidInputResponse(traceId);
  const { playerId } = await context.params;
  if (!isPublicRiotPlayerId(playerId)) return riotInvalidInputResponse(traceId);
  const result = await loadRuntimePublicRiotAnalytics(playerId, cursor ?? undefined);
  if (result.state !== "ready") return riotUnavailableResponse(traceId);
  if (!result.data) return riotNotFoundResponse(traceId);
  return riotReadResponse({ state: "ready", data: result.data }, undefined, traceId);
}
