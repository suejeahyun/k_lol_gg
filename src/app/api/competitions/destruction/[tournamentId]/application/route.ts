import { isDestructionUuid } from "@/modules/competitions/destruction";
import { destructionErrorResponse, destructionMutationResponse, destructionNotFoundResponse, destructionReadResponse, destructionUnavailableResponse, prepareDestructionMutation } from "@/modules/competitions/destruction/destruction-http";
import { requireDestructionApiSession } from "@/modules/competitions/destruction/destruction-server-auth";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("USER");
  if (!auth.ok) return auth.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse();
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse();
  try {
    const application = await runtime.repository.getOwnApplication(tournamentId, auth.session.userId);
    return application ? destructionReadResponse({ application }, application.tournamentRevision) : destructionNotFoundResponse();
  } catch (error) { return destructionErrorResponse(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDestructionMutation(request, auth.session, "destruction:application:upsert");
  if (!prepared.ok) return prepared.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse(prepared.value.traceId);
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse(prepared.value.traceId);
  try {
    const playerId = await runtime.repository.getOwnedPlayerId(auth.session.userId);
    if (!playerId) return destructionNotFoundResponse(prepared.value.traceId);
    return destructionMutationResponse(await runtime.service.upsertOwnApplication(prepared.value.context, tournamentId, playerId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId);
  } catch (error) { return destructionErrorResponse(error, prepared.value.traceId); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDestructionMutation(request, auth.session, "destruction:application:cancel");
  if (!prepared.ok) return prepared.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse(prepared.value.traceId);
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse(prepared.value.traceId);
  try {
    const playerId = await runtime.repository.getOwnedPlayerId(auth.session.userId);
    if (!playerId) return destructionNotFoundResponse(prepared.value.traceId);
    return destructionMutationResponse(await runtime.service.cancelOwnApplication(prepared.value.context, tournamentId, playerId, prepared.value.expectedRevision), prepared.value.traceId);
  } catch (error) { return destructionErrorResponse(error, prepared.value.traceId); }
}
