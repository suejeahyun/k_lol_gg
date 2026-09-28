import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";
import type { RatingWorkerResult } from "./automatic-rating-worker";

export async function handleAutomaticRatingCron(request: Request, dependencies: {
  secret: string | undefined;
  step: () => Promise<RatingWorkerResult>;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const traceId = readValidatedTraceId(request.headers);
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/cron/destruction-ratings" || url.search || !verifyVercelCronBearer(request.headers.get("authorization"), dependencies.secret)) return noStoreJsonResponse({ code: "JOB_AUTH_FAILED" }, { status: 401, traceId });
  let completedSteps = 0;
  try {
    const started = Date.now();
    for (let index = 0; index < 4; index++) {
      const result = await dependencies.step();
      if (result.kind === "UPDATED") completedSteps++;
      if (result.kind !== "UPDATED" || index === 3 || Date.now() - started > 30_000 || result.retryAfterSeconds > 8) return noStoreJsonResponse({ kind: result.kind, completedSteps }, { traceId });
      await (dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(8_000);
    }
    return noStoreJsonResponse({ kind: "UPDATED", completedSteps }, { traceId });
  } catch {
    return noStoreJsonResponse({ code: "RATING_JOB_UNAVAILABLE", completedSteps }, { status: 503, traceId });
  }
}
