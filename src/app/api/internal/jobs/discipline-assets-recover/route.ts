import { disciplineErrorResponse, disciplineJobForbiddenResponse } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/discipline-assets-recover";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return disciplineJobForbiddenResponse(traceId);
  const input = verified.body as Record<string, unknown>;
  const limit = input && Number.isSafeInteger(input.limit) ? Number(input.limit) : 0;
  const before = input && typeof input.before === "string" ? input.before : "";
  if (!input || Object.keys(input).some((key) => !["before", "limit"].includes(key)) || limit < 1 || limit > 100) return disciplineErrorResponse(new Error("INVALID_RECOVERY_INPUT"), traceId);
  const service = getRuntimeDisciplineService(); if (!service) return disciplineErrorResponse(new Error("UNAVAILABLE"), traceId);
  try {
    const claimed = await service.adapter.claimSignedAssetJob({ jobName: "recover", nonce: verified.nonce, bodyDigestHex: verified.bodyDigestHex, requestId: verified.requestId, now: new Date() });
    if (!claimed) return noStoreJsonResponse({ replayed: true, recoveredCount: 0 }, { traceId });
    const recovered = await service.assets.recoverStaleStages({ purpose: "JOB", principalId: "DISCIPLINE_ASSET_RECOVERY", role: "SYSTEM" }, before, limit);
    return noStoreJsonResponse({ replayed: false, recoveredCount: recovered.length }, { traceId });
  } catch (error) { return disciplineErrorResponse(error, traceId); }
}
