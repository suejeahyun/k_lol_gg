import { parsePublicStatisticsQuery } from "@/modules/statistics/application/statistics-query";
import { getRuntimePublicStatisticsService } from "@/modules/statistics/infrastructure/runtime-statistics-data";
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
    const result = await service.getPublicSeasonRanking(query.seasonId, query.minimumParticipation);
    return statisticsReadResponse({
      season: result.season,
      projection: result.projection,
      minimumParticipation: result.minimumParticipation,
      top: {
        winRate: result.rankings.slice(0, 3),
        participation: [...result.rankings]
          .sort((left, right) => right.participationCount - left.participationCount || left.rank - right.rank)
          .slice(0, 3),
        mvp: [...result.rankings]
          .filter((row) => row.mvpCount > 0)
          .sort((left, right) => right.mvpCount - left.mvpCount || left.rank - right.rank)
          .slice(0, 3),
      },
    }, 200, traceId);
  } catch (error) {
    return statisticsServiceErrorResponse(error, traceId);
  }
}
