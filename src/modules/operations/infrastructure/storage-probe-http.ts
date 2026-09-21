import { definePublicProblem, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";
import { verifyOperationsJobHttpRequest } from "./signed-job-http";
import type { StorageProbeJobInput, StorageProbeJobResult } from "./storage-probe-runner";

const problems = {
  authentication: definePublicProblem({ code: "JOB_AUTH_FAILED", status: 401, title: "작업 인증에 실패했습니다.", detail: "서명과 전송 시각을 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "OPERATIONS_UNAVAILABLE", status: 503, title: "운영 서비스를 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
};

export async function handleStorageProbeRequest(request: Request, dependencies: Readonly<{
  runJob: (input: StorageProbeJobInput) => Promise<StorageProbeJobResult>;
}>): Promise<Response> {
  const verified = await verifyOperationsJobHttpRequest(request, "/api/internal/jobs/storage-probe");
  if (!verified.ok || Object.keys(verified.body).length > 0) {
    return problemResponse(problems.authentication, { traceId: readValidatedTraceId(request.headers) });
  }
  // The signed boundary creates this UUID; caller trace headers cannot select a storage key.
  const traceId = verified.requestId.replaceAll("-", "");
  try {
    const result = await dependencies.runJob({ nonce: verified.nonce, requestHashHex: verified.bodyDigestHex, requestId: verified.requestId });
    return noStoreJsonResponse(result.body, { status: result.status, traceId,
      ...(result.status === 429 ? { headers: { "Retry-After": "300" } } : {}) });
  } catch { return problemResponse(problems.unavailable, { traceId }); }
}
