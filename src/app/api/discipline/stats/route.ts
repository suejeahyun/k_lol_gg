import { disciplineErrorResponse, disciplineReadResponse, disciplineUnavailableResponse } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService();
  if (!service) return disciplineUnavailableResponse(traceId);
  try { return disciplineReadResponse(await service.adapter.getPublicStatistics(), traceId); }
  catch (error) { return disciplineErrorResponse(error, traceId); }
}
