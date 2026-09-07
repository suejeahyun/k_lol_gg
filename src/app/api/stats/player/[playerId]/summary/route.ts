import { parsePlayerStatisticsQuery, isStatisticsUuid } from "@/modules/statistics/application/statistics-query";
import { getRuntimePublicStatisticsService } from "@/modules/statistics/infrastructure/runtime-statistics-data";
import {
  statisticsInvalidInputResponse,
  statisticsNotFoundResponse,
  statisticsReadResponse,
  statisticsServiceErrorResponse,
  statisticsUnavailableResponse,
} from "@/modules/statistics/infrastructure/statistics-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ playerId: string }> };

export async function GET(request: Request, context: Context) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parsePlayerStatisticsQuery(request.url);
  const { playerId } = await context.params;
  if (!query || !isStatisticsUuid(playerId)) return statisticsInvalidInputResponse(traceId);
  const service = getRuntimePublicStatisticsService();
  if (!service) return statisticsUnavailableResponse(traceId);
  try {
    const result = await service.getPublicPlayerStatistics(playerId, query.seasonId);
    return result
      ? statisticsReadResponse(result, 200, traceId)
      : statisticsNotFoundResponse(traceId);
  } catch (error) {
    return statisticsServiceErrorResponse(error, traceId);
  }
}
