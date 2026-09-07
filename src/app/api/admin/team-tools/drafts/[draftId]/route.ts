import { readValidatedTraceId } from "@/platform/http";
import { TeamBalanceServiceError } from "@/modules/team-tools";
import { getRuntimeTeamBalanceService } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { requireTeamBalanceApiSession, teamBalanceErrorResponse, teamBalanceReadResponse, teamBalanceUnavailableResponse } from "@/modules/team-tools/infrastructure/team-balance-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const auth = await requireTeamBalanceApiSession("ADMIN", request); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return teamBalanceErrorResponse(new TeamBalanceServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeTeamBalanceService(); if (!service) return teamBalanceUnavailableResponse(traceId);
  try {
    const draft = await service.getDraft({ actorUserAccountId: auth.session.userId, authorization: "ADMIN" }, (await context.params).draftId);
    if (!draft) throw new TeamBalanceServiceError("NOT_FOUND", "missing");
    return teamBalanceReadResponse({ draft }, draft.revision, traceId);
  } catch (error) { return teamBalanceErrorResponse(error, traceId); }
}
