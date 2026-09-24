import { isPublicRiotPlayerId } from "@/modules/riot/application/riot-query";
import { RIOT_MATCH_ID_PATTERN } from "@/modules/riot/domain/riot-match-normalizer";
import { loadRuntimePublicRiotMatch } from "@/modules/riot/infrastructure/runtime-riot";
import { riotInvalidInputResponse, riotNotFoundResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

/** Loads one already-collected timeline after the user expands a game. */
export async function GET(request: Request, context: { params: Promise<{ playerId: string; matchId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return riotInvalidInputResponse(traceId);
  const { playerId, matchId } = await context.params;
  if (!isPublicRiotPlayerId(playerId) || !RIOT_MATCH_ID_PATTERN.test(matchId)) return riotInvalidInputResponse(traceId);
  const result = await loadRuntimePublicRiotMatch(playerId, matchId);
  if (result.state !== "ready") return riotUnavailableResponse(traceId);
  if (!result.data) return riotNotFoundResponse(traceId);
  return riotReadResponse({ state: "ready", data: result.data }, undefined, traceId);
}
