import { getRuntimeTeamBalanceService } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { TeamBalanceServiceError } from "@/modules/team-tools";
import {
  prepareTeamBalanceMutation,
  requireTeamBalanceApiSession,
  teamBalanceErrorResponse,
  teamBalanceMutationResponse,
  teamBalanceUnavailableResponse,
} from "@/modules/team-tools/infrastructure/team-balance-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await requireTeamBalanceApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareTeamBalanceMutation(request, "team-tools:drafts:create", authorization.session);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeTeamBalanceService();
  if (!service) return teamBalanceUnavailableResponse(prepared.value.traceId);
  try {
    if (prepared.value.expectedRevision !== 0) {
      throw new TeamBalanceServiceError("PRECONDITION_FAILED", "새 팀 초안의 revision은 0이어야 합니다.");
    }
    return teamBalanceMutationResponse(await service.createDraft(prepared.value.context, prepared.value.body), prepared.value.traceId);
  } catch (error) {
    return teamBalanceErrorResponse(error, prepared.value.traceId);
  }
}
