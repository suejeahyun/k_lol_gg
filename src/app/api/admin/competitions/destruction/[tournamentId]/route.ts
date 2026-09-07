import { isDestructionUuid } from "@/modules/competitions/destruction";
import { destructionErrorResponse, destructionMutationResponse, destructionNotFoundResponse, destructionReadResponse, destructionUnavailableResponse, prepareDestructionMutation } from "@/modules/competitions/destruction/destruction-http";
import { requireDestructionApiSession } from "@/modules/competitions/destruction/destruction-server-auth";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse();
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse();
  try {
    const destruction = await runtime.repository.getAdmin(tournamentId);
    return destruction ? destructionReadResponse({ destruction }, destruction.revision) : destructionNotFoundResponse();
  } catch (error) { return destructionErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const auth = await requireDestructionApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDestructionMutation(request, auth.session, "admin:destruction:command");
  if (!prepared.ok) return prepared.response;
  const { tournamentId } = await params;
  if (!isDestructionUuid(tournamentId)) return destructionNotFoundResponse(prepared.value.traceId);
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse(prepared.value.traceId);
  try { return destructionMutationResponse(await runtime.service.executeAdmin(prepared.value.context, tournamentId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return destructionErrorResponse(error, prepared.value.traceId); }
}
