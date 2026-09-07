import { getRuntimeMmrService } from "@/modules/mmr/infrastructure/runtime-mmr";
import { mmrErrorResponse, mmrMutationResponse, mmrUnavailableResponse, prepareMmrMutation, requireMmrApiSession } from "@/modules/mmr/infrastructure/mmr-http";

export async function POST(request: Request) {
  const auth = await requireMmrApiSession("SUPER_ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareMmrMutation(request, auth.session, "admin:mmr:recalculate");
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMmrService();
  if (!service) return mmrUnavailableResponse(prepared.value.traceId);
  try {
    return mmrMutationResponse(
      await service.recalculate(prepared.value.context, prepared.value.expectedGeneration, prepared.value.body),
      prepared.value.traceId,
    );
  } catch (error) { return mmrErrorResponse(error, prepared.value.traceId); }
}
