import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  prepareSeasonMutation,
  requireSeasonApiSession,
  seasonMutationResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ applicationId: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireSeasonApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(
    request,
    "admin:season-applications:review",
    authorization.session,
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const { applicationId } = await context.params;
    const result = await service.reviewApplication(
      prepared.value.context,
      applicationId,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}
