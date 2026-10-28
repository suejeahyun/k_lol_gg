import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";
import type { CommunitySiteProvisioningRunResult } from "./provisioning-worker";

const problems = {
  authentication: definePublicProblem({ code: "JOB_AUTH_FAILED", status: 401, title: "작업 인증에 실패했습니다.", detail: "예약 작업 설정을 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "COMMUNITY_SITE_JOB_UNAVAILABLE", status: 503, title: "사이트 개설 작업을 사용할 수 없습니다.", detail: "개설 작업과 공급자 설정을 확인해 주세요." }),
};
export async function handleCommunitySitesCron(request: Request, dependencies: {
  enabled: boolean; provisioningEnabled?: boolean; secret: string | undefined; run: () => Promise<CommunitySiteProvisioningRunResult>;
}): Promise<Response> {
  const traceId = readValidatedTraceId(request.headers);
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/cron/community-sites" || url.search || !verifyVercelCronBearer(request.headers.get("authorization"), dependencies.secret)) {
    return problemResponse(problems.authentication, { traceId });
  }
  if (!dependencies.enabled) return problemResponse(problems.unavailable, { traceId });
  if (dependencies.provisioningEnabled === false) {
    return noStoreJsonResponse({ job: "community-sites", kind: "disabled" }, { traceId });
  }
  try {
    const result = await dependencies.run();
    return noStoreJsonResponse({ job: "community-sites", kind: result.kind, ...(result.errorCode ? { errorCode: result.errorCode } : {}) }, { traceId });
  } catch {
    return problemResponse(problems.unavailable, { traceId, headers: { "Retry-After": "60" } });
  }
}
