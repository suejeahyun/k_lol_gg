import { isDestructionUuid } from "@/modules/competitions/destruction";
import { destructionErrorResponse, destructionMutationResponse, destructionNotFoundResponse, destructionUnavailableResponse, prepareDestructionMutation } from "@/modules/competitions/destruction/destruction-http";
import { requireDestructionApiSession } from "@/modules/competitions/destruction/destruction-server-auth";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function POST(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDestructionMutation(request, auth.session, "destruction:mvp:vote");
  if (!prepared.ok) return prepared.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse(prepared.value.traceId);
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse(prepared.value.traceId);
  try {
    const playerId = await runtime.repository.getOwnedPlayerId(auth.session.userId);
    if (!playerId) return destructionNotFoundResponse(prepared.value.traceId);
    return destructionMutationResponse(await runtime.service.castOwnMvpVote(prepared.value.context, tournamentId, playerId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId);
  } catch (error) { return destructionErrorResponse(error, prepared.value.traceId); }
}
