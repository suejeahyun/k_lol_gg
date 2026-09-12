import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { jobAuthenticationErrorResponse, operationsErrorResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { buildVercelKakaoDailyCloseInput, verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/cron/kakao-daily-close";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const url = new URL(request.url);
  if (
    url.pathname !== path ||
    url.search.length > 0 ||
    !verifyVercelCronBearer(request.headers.get("authorization"), process.env.CRON_SECRET)
  ) {
    return jobAuthenticationErrorResponse(traceId);
  }
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const result = await repository.runSignedKakaoDailyClose(buildVercelKakaoDailyCloseInput(new Date()));
    return noStoreJsonResponse(result, { traceId });
  } catch (error) {
    return operationsErrorResponse(error, traceId);
  }
}
