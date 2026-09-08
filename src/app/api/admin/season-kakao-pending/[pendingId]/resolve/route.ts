import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  prepareSeasonMutation,
  requireSeasonApiSession,
  seasonMutationResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ pendingId: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireSeasonApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(request, "admin:season-kakao-pending:resolve", authorization.session);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const { pendingId } = await context.params;
    const result = await service.resolveKakaoPendingApplication(
      prepared.value.context,
      pendingId,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}
