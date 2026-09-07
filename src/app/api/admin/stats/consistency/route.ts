import { parsePlayerStatisticsQuery } from "@/modules/statistics/application/statistics-query";
import { getRuntimeAdminStatisticsService } from "@/modules/statistics/infrastructure/runtime-statistics-data";
import {
  requireStatisticsApiSession,
  statisticsInvalidInputResponse,
  statisticsReadResponse,
  statisticsServiceErrorResponse,
  statisticsUnavailableResponse,
} from "@/modules/statistics/infrastructure/statistics-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireStatisticsApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parsePlayerStatisticsQuery(request.url);
  if (!query) return statisticsInvalidInputResponse(traceId);
  const service = getRuntimeAdminStatisticsService();
  if (!service) return statisticsUnavailableResponse(traceId);
  try {
    return statisticsReadResponse(await service.getAdminStatus(query.seasonId), 200, traceId);
  } catch (error) {
    return statisticsServiceErrorResponse(error, traceId);
  }
}
