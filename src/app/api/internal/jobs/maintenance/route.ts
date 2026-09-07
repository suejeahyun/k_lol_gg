import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { jobAuthenticationErrorResponse, operationsErrorResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/maintenance";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return jobAuthenticationErrorResponse(traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    return noStoreJsonResponse(await repository.runSignedMaintenance({ jobName: "maintenance", nonce: verified.nonce, requestHashHex: verified.bodyDigestHex, requestId: verified.requestId }), { traceId });
  } catch (error) { return operationsErrorResponse(error, traceId); }
}
