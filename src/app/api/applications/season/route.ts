import { readValidatedTraceId } from "@/platform/http";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import { guardSeasonApplicationMutation } from "@/modules/seasons/infrastructure/season-application-rate-limit";
import {
  prepareSeasonMutation,
  rejectSeasonQuery,
  requireSeasonApiSession,
  seasonMutationResponse,
  seasonRateLimitedResponse,
  seasonRateLimitUnavailableResponse,
  seasonReadResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const queryProblem = rejectSeasonQuery(request, traceId);
  if (queryProblem) return queryProblem;
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(traceId);
  try {
    const session = await getCurrentSession();
    return seasonReadResponse(await service.getApplicationHub(session?.userId ?? null), 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}

export async function POST(request: Request) {
  const authorization = await requireSeasonApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(
    request,
    "applications:season:upsert",
    authorization.session.userId,
  );
  if (!prepared.ok) return prepared.response;
  const rateLimit = await guardSeasonApplicationMutation(request, authorization.session, "UPSERT");
  if (!rateLimit.available) return seasonRateLimitUnavailableResponse(prepared.value.traceId);
  if (!rateLimit.allowed) return seasonRateLimitedResponse(rateLimit.retryAfterSeconds, prepared.value.traceId);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const result = await service.upsertOwnApplication(
      prepared.value.context,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireSeasonApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(
    request,
    "applications:season:cancel",
    authorization.session.userId,
  );
  if (!prepared.ok) return prepared.response;
  const rateLimit = await guardSeasonApplicationMutation(request, authorization.session, "CANCEL");
  if (!rateLimit.available) return seasonRateLimitUnavailableResponse(prepared.value.traceId);
  if (!rateLimit.allowed) return seasonRateLimitedResponse(rateLimit.retryAfterSeconds, prepared.value.traceId);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    const result = await service.cancelOwnApplication(
      prepared.value.context,
      prepared.value.expectedRevision,
      prepared.value.body,
    );
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}
