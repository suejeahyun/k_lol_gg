import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { getRuntimeAdminChampionQueryService } from "@/modules/champions/infrastructure/runtime-champions";
import { getRuntimeChampionCommandHandler } from "@/modules/champions/infrastructure/runtime-champions";
import { championMutationError, championMutationResponse, championUnavailable, prepareChampionMutation } from "@/modules/champions/infrastructure/champion-http";
import { definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const unauthenticated = definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "관리자 로그인이 필요합니다.", detail: "다시 로그인해 주세요." });
const forbidden = definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "관리자 권한과 2단계 인증을 확인해 주세요." });
const notFound = definePublicProblem({ code: "NOT_FOUND", status: 404, title: "챔피언을 찾을 수 없습니다.", detail: "주소를 확인해 주세요." });
const unavailable = definePublicProblem({ code: "CHAMPION_SERVICE_UNAVAILABLE", status: 503, title: "챔피언 관리 기능을 사용할 수 없습니다.", detail: "데이터베이스 연결을 확인해 주세요." });

export async function GET(request: Request, context: { params: Promise<{ championId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  const auth = await authorizeApiRole("ADMIN");
  if (!auth.allowed) return problemResponse(auth.reason === "UNAUTHENTICATED" ? unauthenticated : forbidden, { traceId });
  if (new URL(request.url).searchParams.size) return problemResponse(notFound, { traceId });
  const service = getRuntimeAdminChampionQueryService();
  if (!service) return problemResponse(unavailable, { traceId });
  try {
    const item = await service.getAdmin((await context.params).championId);
    return item ? noStoreJsonResponse(item, { traceId, headers: { ETag: formatRevisionEtag(item.revision) } }) : problemResponse(notFound, { traceId });
  } catch { return problemResponse(notFound, { traceId }); }
}

async function mutate(request: Request, context: { params: Promise<{ championId: string }> }, type: "UPDATE_CHAMPION" | "DEACTIVATE_CHAMPION") {
  const auth = await authorizeApiRole("ADMIN");
  if (!auth.allowed) return problemResponse(auth.reason === "UNAUTHENTICATED" ? unauthenticated : forbidden, { traceId: readValidatedTraceId(request.headers) });
  const prepared = await prepareChampionMutation(request, auth.session, { type, championKey: (await context.params).championId });
  if (!prepared.ok) return prepared.response;
  const handler = getRuntimeChampionCommandHandler();
  if (!handler) return championUnavailable(prepared.value.traceId);
  try { return championMutationResponse(await handler.handle(prepared.value.command), prepared.value.traceId); }
  catch (error) { return championMutationError(error, prepared.value.traceId); }
}

export function PATCH(request: Request, context: { params: Promise<{ championId: string }> }) { return mutate(request, context, "UPDATE_CHAMPION"); }
export function DELETE(request: Request, context: { params: Promise<{ championId: string }> }) { return mutate(request, context, "DEACTIVATE_CHAMPION"); }
