import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

import type { MmrService } from "../application/mmr-service";

const PATH = "/api/cron/mmr-projection";
const problems = {
  authentication: definePublicProblem({ code: "JOB_AUTH_FAILED", status: 401, title: "작업 인증에 실패했습니다.", detail: "예약 작업 설정을 확인해 주세요." }),
  formulaTransition: definePublicProblem({ code: "MMR_FORMULA_TRANSITION_REQUIRED", status: 409, title: "MMR 공식 전환 확인이 필요합니다.", detail: "/admin/balance-ai에서 최고 관리자가 공식 변경을 확인하고 재계산해야 자동 갱신을 시작합니다." }),
  unavailable: definePublicProblem({ code: "MMR_JOB_UNAVAILABLE", status: 503, title: "MMR 갱신 작업을 처리하지 못했습니다.", detail: "작업 상태를 확인한 뒤 다시 시도해 주세요." }),
};

export async function handleMmrProjectionCron(
  request: Request,
  dependencies: Readonly<{
    secret: string | undefined;
    getService: () => Pick<MmrService, "catchUp"> | null;
    now?: () => Date;
  }>,
): Promise<Response> {
  const traceId = readValidatedTraceId(request.headers);
  const url = new URL(request.url);
  if (
    request.method !== "GET" || url.pathname !== PATH || url.search.length > 0 ||
    !verifyVercelCronBearer(request.headers.get("authorization"), dependencies.secret)
  ) {
    return problemResponse(problems.authentication, { traceId });
  }
  try {
    const service = dependencies.getService();
    if (!service) return problemResponse(problems.unavailable, { traceId, headers: { "Retry-After": "60" } });
    const result = await service.catchUp(dependencies.now?.() ?? new Date());
    if (result.kind === "ADMIN_RECALCULATION_REQUIRED") {
      return problemResponse(problems.formulaTransition, { traceId });
    }
    // Only fixed states and counters: never disclose source IDs, member data or raw errors.
    return noStoreJsonResponse({
      job: "mmr-projection",
      kind: result.kind,
      generation: result.generation,
      consumedEventCount: result.kind === "REBUILT" ? result.consumedEventCount : 0,
    }, { traceId });
  } catch {
    return problemResponse(problems.unavailable, { traceId, headers: { "Retry-After": "60" } });
  }
}
