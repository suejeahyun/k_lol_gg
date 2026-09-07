import { verifyOperationsJobHttpRequest } from "@/modules/operations/infrastructure/signed-job-http";
import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import {
  exactObject,
  riotErrorResponse,
  riotJobForbiddenResponse,
  riotUnavailableResponse,
} from "@/modules/riot/infrastructure/riot-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

const path = "/api/internal/jobs/riot-sync";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verified = await verifyOperationsJobHttpRequest(request, path);
  if (!verified.ok) return riotJobForbiddenResponse(traceId);
  if (!exactObject(verified.body, [])) return riotJobForbiddenResponse(traceId);
  const runtime = getRuntimeRiot();
  if (!runtime) return riotUnavailableResponse(traceId);
  try {
    const result = await runtime.service.runNextSync({
      principalId: "job:riot-sync",
      authorizationIntent: {
        kind: "SIGNED_JOB",
        jobName: "riot-sync",
        nonce: verified.nonce,
        timestampSeconds: verified.timestampSeconds,
        bodyDigestHex: verified.bodyDigestHex,
        signatureHex: verified.signatureHex,
        transactionRecheck: true,
      },
    });
    return noStoreJsonResponse(result, { traceId });
  } catch (error) {
    return riotErrorResponse(error, traceId);
  }
}
