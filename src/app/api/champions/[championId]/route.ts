import { getRuntimePublicChampionQueryService } from "@/modules/champions/infrastructure/runtime-champions";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const notFound = definePublicProblem({ code: "NOT_FOUND", status: 404, title: "챔피언을 찾을 수 없습니다.", detail: "주소를 확인해 주세요." });
const unavailable = definePublicProblem({ code: "CHAMPION_SERVICE_UNAVAILABLE", status: 503, title: "챔피언 정보를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." });

export async function GET(request: Request, context: { params: Promise<{ championId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return problemResponse(notFound, { traceId });
  const service = getRuntimePublicChampionQueryService();
  if (!service) return problemResponse(unavailable, { traceId });
  try {
    const item = await service.getPublic((await context.params).championId);
    return item ? noStoreJsonResponse(item, { traceId }) : problemResponse(notFound, { traceId });
  } catch { return problemResponse(notFound, { traceId }); }
}
