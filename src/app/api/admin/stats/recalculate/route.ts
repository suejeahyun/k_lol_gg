import { getRuntimeAdminStatisticsService } from "@/modules/statistics/infrastructure/runtime-statistics-data";
import {
  prepareStatisticsMutation,
  requireStatisticsApiSession,
  statisticsMutationResponse,
  statisticsServiceErrorResponse,
  statisticsUnavailableResponse,
} from "@/modules/statistics/infrastructure/statistics-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await requireStatisticsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareStatisticsMutation(request, authorization.session);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeAdminStatisticsService();
  if (!service) return statisticsUnavailableResponse(prepared.value.traceId);
  try {
    const result = await service.recalculateSeason(
      prepared.value.context,
      prepared.value.expectedGeneration,
      prepared.value.body,
    );
    return statisticsMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return statisticsServiceErrorResponse(error, prepared.value.traceId);
  }
}
