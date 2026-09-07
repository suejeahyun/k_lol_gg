import { parseChampionListQuery } from "@/modules/champions";
import { getRuntimePublicChampionQueryService } from "@/modules/champions/infrastructure/runtime-champions";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const invalidQuery = definePublicProblem({ code: "INVALID_QUERY", status: 400, title: "검색 조건이 올바르지 않습니다.", detail: "검색어와 페이지 범위를 확인해 주세요." });
const unavailable = definePublicProblem({ code: "CHAMPION_SERVICE_UNAVAILABLE", status: 503, title: "챔피언 목록을 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." });

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parseChampionListQuery(request.url, false);
  if (!query) return problemResponse(invalidQuery, { traceId });
  const service = getRuntimePublicChampionQueryService();
  if (!service) return problemResponse(unavailable, { traceId });
  try { return noStoreJsonResponse(await service.listPublic(query), { traceId }); }
  catch { return problemResponse(unavailable, { traceId }); }
}
