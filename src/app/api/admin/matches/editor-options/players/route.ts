import { readValidatedTraceId } from "@/platform/http";
import { parseAdminPlayerOptionQuery } from "@/modules/matches/infrastructure/match-query";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parseAdminPlayerOptionQuery(request.url);
  if (!query) return matchInvalidInputResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const players = await service.searchAdminPlayerOptions(query.query, query.includePlayerIds);
    return matchReadResponse({
      items: players.slice(0, 20).map((player) => ({
        value: player.id,
        label: `${player.nickname}#${player.tagLine}`,
        status: player.status,
      })),
    }, 200, traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
