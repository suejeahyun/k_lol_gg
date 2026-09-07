import { readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchNotFoundResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ matchId: string }> };

export async function GET(request: Request, context: Context) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchInvalidInputResponse(traceId);
  const { matchId } = await context.params;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    if (/^[1-9][0-9]{0,9}$/.test(matchId) && Number(matchId) <= 2_147_483_647) {
      const id = await service.getPublicIdByLegacyId(Number(matchId));
      if (!id) return matchNotFoundResponse(traceId);
      return new Response(null, { status: 308, headers: { Location: `/api/matches/${id}` } });
    }
    const match = await service.getPublic(matchId);
    return match ? matchReadResponse({ match }, 200, traceId) : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
