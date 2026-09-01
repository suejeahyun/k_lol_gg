import { readValidatedTraceId } from "@/platform/http";
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
    return seasonReadResponse({ season: await service.getCurrentSeason() }, 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}
