import { readValidatedTraceId } from "@/platform/http";
import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  rejectSeasonQuery,
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
    const session = await getCurrentSession("ACCOUNT");
    const hub = await service.getApplicationHub(session?.userId ?? null);
    return seasonReadResponse(
      {
        currentSeason: hub.currentSeason,
        counts: hub.counts,
        viewer: hub.viewer,
        canApply: hub.canApply,
      },
      200,
      traceId,
    );
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}
