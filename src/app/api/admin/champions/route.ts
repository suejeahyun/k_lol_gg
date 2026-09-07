import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { parseChampionListQuery } from "@/modules/champions";
import { getRuntimeAdminChampionQueryService } from "@/modules/champions/infrastructure/runtime-champions";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const unauthenticated = definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "관리자 로그인이 필요합니다.", detail: "다시 로그인해 주세요." });
const forbidden = definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "관리자 권한과 2단계 인증을 확인해 주세요." });
const invalidQuery = definePublicProblem({ code: "INVALID_QUERY", status: 400, title: "검색 조건이 올바르지 않습니다.", detail: "검색어·상태·페이지 범위를 확인해 주세요." });
const unavailable = definePublicProblem({ code: "CHAMPION_SERVICE_UNAVAILABLE", status: 503, title: "챔피언 관리 기능을 사용할 수 없습니다.", detail: "데이터베이스 연결을 확인해 주세요." });

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const auth = await authorizeApiRole("ADMIN");
  if (!auth.allowed) return problemResponse(auth.reason === "UNAUTHENTICATED" ? unauthenticated : forbidden, { traceId });
  const query = parseChampionListQuery(request.url, true);
  if (!query) return problemResponse(invalidQuery, { traceId });
  const service = getRuntimeAdminChampionQueryService();
  if (!service) return problemResponse(unavailable, { traceId });
  try { return noStoreJsonResponse(await service.listAdmin(query), { traceId }); }
  catch { return problemResponse(unavailable, { traceId }); }
}
