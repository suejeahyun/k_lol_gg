import { disciplineErrorResponse, disciplineJobForbiddenResponse } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/discipline-assets-cleanup";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return disciplineJobForbiddenResponse(traceId);
  const input = verified.body as Record<string, unknown>;
  const limit = input && Object.keys(input).length === 1 && Number.isSafeInteger(input.limit) ? Number(input.limit) : 0;
  if (limit < 1 || limit > 100) return disciplineErrorResponse(new Error("INVALID_CLEANUP_LIMIT"), traceId);
  const service = getRuntimeDisciplineService(); if (!service) return disciplineErrorResponse(new Error("UNAVAILABLE"), traceId);
  try {
    const claimed = await service.adapter.claimSignedAssetJob({ jobName: "cleanup", nonce: verified.nonce, bodyDigestHex: verified.bodyDigestHex, requestId: verified.requestId, now: new Date() });
    if (!claimed) return noStoreJsonResponse({ replayed: true, selected: 0, succeeded: 0, failed: 0 }, { traceId });
    const actor = { purpose: "JOB" as const, principalId: "DISCIPLINE_ASSET_CLEANUP", role: "SYSTEM" as const };
    const plans = await service.assets.planCleanup(actor, limit);
    let succeeded = 0;
    for (const plan of plans) {
      try { await service.assets.executeCleanup(actor, plan); succeeded += 1; }
      catch { /* durable failure outcome is recorded by the service */ }
    }
    return noStoreJsonResponse({ replayed: false, selected: plans.length, succeeded, failed: plans.length - succeeded }, { traceId });
  } catch (error) { return disciplineErrorResponse(error, traceId); }
}
