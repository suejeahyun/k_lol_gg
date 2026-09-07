import { formatRevisionEtag, readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchMutationResponse,
  matchNotFoundResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchJsonMutation,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ matchId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchNotFoundResponse(traceId);
  const { matchId } = await context.params;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const match = await service.getAdminMatch(matchId);
    return match
      ? matchReadResponse({ match }, 200, traceId, { ETag: formatRevisionEtag(match.revision) })
      : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}

export async function PATCH(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const { matchId } = await context.params;
  const prepared = await prepareMatchJsonMutation(
    request,
    `admin:matches:${matchId}:update`,
    authorization.session,
    "ADMIN",
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    return matchMutationResponse(
      await service.updateMatch(
        prepared.context,
        matchId,
        prepared.expectedRevision,
        prepared.body,
      ),
      prepared.traceId,
    );
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}
