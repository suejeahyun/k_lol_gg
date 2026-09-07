import { getRuntimeTeamBalanceService } from "@/modules/team-tools/infrastructure/runtime-team-balance";
import { prepareTeamBalanceMutation, requireTeamBalanceApiSession, teamBalanceErrorResponse, teamBalanceMutationResponse, teamBalanceUnavailableResponse } from "@/modules/team-tools/infrastructure/team-balance-http";

export async function POST(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const auth = await requireTeamBalanceApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareTeamBalanceMutation(request, "team-tools:drafts:save", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeTeamBalanceService(); if (!service) return teamBalanceUnavailableResponse(prepared.value.traceId);
  try { return teamBalanceMutationResponse(await service.saveDraft(prepared.value.context, (await context.params).draftId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return teamBalanceErrorResponse(error, prepared.value.traceId); }
}
