import { getRuntimeMmrService } from "@/modules/mmr/infrastructure/runtime-mmr";
import { mmrErrorResponse, mmrInvalidInputResponse, mmrNotFoundResponse, mmrReadResponse, mmrUnavailableResponse, requireMmrApiSession } from "@/modules/mmr/infrastructure/mmr-http";
import { readValidatedTraceId } from "@/platform/http";

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const auth = await requireMmrApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return mmrInvalidInputResponse(traceId);
  const service = getRuntimeMmrService();
  if (!service) return mmrUnavailableResponse(traceId);
  try {
    const player = await service.getPlayer((await context.params).playerId);
    return player ? mmrReadResponse({ player }, undefined, traceId) : mmrNotFoundResponse(traceId);
  } catch (error) { return mmrErrorResponse(error, traceId); }
}
