import { parsePublicStatisticsQuery } from "@/modules/statistics/application/statistics-query";
import { buildPublicRankingView } from "@/modules/statistics/domain/public-ranking-view";
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
        winRate: buildPublicRankingView(result.rankings, "win-rate").slice(0, 3),
        participation: buildPublicRankingView(result.rankings, "participation").slice(0, 3),
        mvp: buildPublicRankingView(result.rankings, "mvp")
          .filter((row) => row.mvpCount > 0)
          .slice(0, 3),
      },
    }, 200, traceId);
  } catch (error) {
    return statisticsServiceErrorResponse(error, traceId);
  }
}
