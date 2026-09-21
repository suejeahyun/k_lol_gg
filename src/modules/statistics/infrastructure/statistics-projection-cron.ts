import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

import { drainStatisticsProjection } from "../application/drain-statistics-projection";
import type { StatisticsProjectionRepository } from "../application/ports/statistics-projection-repository";

const PATH = "/api/cron/statistics-projection";
const MAXIMUM_EVENTS = 10;
const MAXIMUM_DURATION_MS = 20_000;
const problems = {
  authentication: definePublicProblem({ code: "JOB_AUTH_FAILED", status: 401, title: "작업 인증에 실패했습니다.", detail: "예약 작업 설정을 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "STATISTICS_JOB_UNAVAILABLE", status: 503, title: "통계 갱신 작업을 처리하지 못했습니다.", detail: "작업 상태를 확인한 뒤 다시 시도해 주세요." }),
};

export async function handleStatisticsProjectionCron(
  request: Request,
  dependencies: Readonly<{
    secret: string | undefined;
    getRepository: () => StatisticsProjectionRepository | null;
    now?: () => Date;
    monotonicNow?: () => number;
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
    const repository = dependencies.getRepository();
    if (!repository) return problemResponse(problems.unavailable, { traceId, headers: { "Retry-After": "60" } });
    const result = await drainStatisticsProjection(repository, {
      maximumEvents: MAXIMUM_EVENTS,
      maximumDurationMs: MAXIMUM_DURATION_MS,
      now: dependencies.now,
      monotonicNow: dependencies.monotonicNow,
    });
    // Operational counters only: never emit event IDs, member data or raw errors.
    return noStoreJsonResponse({ job: "statistics-projection", ...result }, {
      status: result.failed > 0 ? 503 : 200,
      traceId,
      ...(result.failed > 0 ? { headers: { "Retry-After": "60" } } : {}),
    });
  } catch {
    return problemResponse(problems.unavailable, { traceId, headers: { "Retry-After": "60" } });
  }
}
