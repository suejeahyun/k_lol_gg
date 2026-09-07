import { parseDestructionListQuery } from "@/modules/competitions/destruction";
import { destructionErrorResponse, destructionInvalidResponse, destructionMutationResponse, destructionReadResponse, destructionUnavailableResponse, prepareDestructionMutation } from "@/modules/competitions/destruction/destruction-http";
import { requireDestructionApiSession } from "@/modules/competitions/destruction/destruction-server-auth";
import { getRuntimeDestruction } from "@/modules/competitions/destruction/runtime-destruction";

export async function GET(request: Request) {
  const auth = await requireDestructionApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const query = parseDestructionListQuery(request.url);
  if (!query) return destructionInvalidResponse();
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse();
  try { return destructionReadResponse(await runtime.repository.listAdmin(query)); }
  catch { return destructionUnavailableResponse(); }
}

export async function POST(request: Request) {
  const auth = await requireDestructionApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDestructionMutation(request, auth.session, "admin:destruction:create");
  if (!prepared.ok) return prepared.response;
  if (prepared.value.expectedRevision !== 0) return destructionInvalidResponse(prepared.value.traceId);
  const runtime = getRuntimeDestruction();
  if (!runtime) return destructionUnavailableResponse(prepared.value.traceId);
  try { return destructionMutationResponse(await runtime.service.create(prepared.value.context, prepared.value.body), prepared.value.traceId); }
  catch (error) { return destructionErrorResponse(error, prepared.value.traceId); }
}
