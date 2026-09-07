import { TeamBalanceServiceError } from "@/modules/team-tools";
import { getRuntimeTeamBalanceRecommendations } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import {
  requireTeamBalanceApiSession,
  teamBalanceErrorResponse,
  teamBalanceReadResponse,
  teamBalanceUnavailableResponse,
} from "@/modules/team-tools/infrastructure/team-balance-http";
import { parseTeamBalanceRecommendationApiQuery } from "@/modules/team-tools/infrastructure/team-recommendation-query";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const auth = await requireTeamBalanceApiSession("ADMIN", request);
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  const team = parseTeamBalanceRecommendationApiQuery(request.url);
  if (!team) return teamBalanceErrorResponse(new TeamBalanceServiceError("INVALID_INPUT", "team"), traceId);
  const service = getRuntimeTeamBalanceRecommendations();
  if (!service) return teamBalanceUnavailableResponse(traceId);
  try {
    const recommendation = await service.getRecommendation(
      { actorUserAccountId: auth.session.userId, authorization: "ADMIN" },
      (await context.params).draftId,
      team,
    );
    if (!recommendation) throw new TeamBalanceServiceError("NOT_FOUND", "missing");
    return teamBalanceReadResponse({ recommendation }, recommendation.draft.revision, traceId);
  } catch (error) {
    return teamBalanceErrorResponse(error, traceId);
  }
}
