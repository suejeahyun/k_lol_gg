import { jobAuthenticationErrorResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/kakao-daily-close";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return jobAuthenticationErrorResponse(traceId);
  // The scheduling boundary exists, but no external Kakao call or synthetic state mutation is permitted in S13.
  return operationsUnavailableResponse(traceId);
}
