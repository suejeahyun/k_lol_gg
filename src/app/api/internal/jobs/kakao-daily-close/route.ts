import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { jobAuthenticationErrorResponse, operationsErrorResponse, operationsInvalidResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/kakao-daily-close";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return jobAuthenticationErrorResponse(traceId);
  const body = verified.body as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "idleHours" && key !== "maximumClosures")) {
    return operationsInvalidResponse(traceId);
  }
  const idleHours = body.idleHours === undefined ? 12 : body.idleHours;
  const maximumClosures = body.maximumClosures === undefined ? 100 : body.maximumClosures;
  if (!Number.isSafeInteger(idleHours) || Number(idleHours) < 1 || Number(idleHours) > 168 || !Number.isSafeInteger(maximumClosures) || Number(maximumClosures) < 1 || Number(maximumClosures) > 500) {
    return operationsInvalidResponse(traceId);
  }
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const result = await repository.runSignedKakaoDailyClose({
      jobName: "kakao-daily-close",
      nonce: verified.nonce,
      requestHashHex: verified.bodyDigestHex,
      requestId: verified.requestId,
      idleHours: Number(idleHours),
      maximumClosures: Number(maximumClosures),
    });
    return noStoreJsonResponse(result, { traceId });
  } catch (error) {
    return operationsErrorResponse(error, traceId);
  }
}
