import { getRuntimePublicStatisticsService } from "@/modules/statistics/infrastructure/runtime-statistics-data";
import { parsePublicStatisticsQuery } from "@/modules/statistics/application/statistics-query";
import {
  statisticsInvalidInputResponse,
  statisticsReadResponse,
  statisticsServiceErrorResponse,
  statisticsUnavailableResponse,
} from "@/modules/statistics/infrastructure/statistics-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parsePublicStatisticsQuery(request.url);
  if (!query) return statisticsInvalidInputResponse(traceId);
  const service = getRuntimePublicStatisticsService();
  if (!service) return statisticsUnavailableResponse(traceId);
  try {
    return statisticsReadResponse(
      await service.getPublicSeasonRanking(query.seasonId, query.minimumParticipation),
      200,
      traceId,
    );
  } catch (error) {
    return statisticsServiceErrorResponse(error, traceId);
  }
}
