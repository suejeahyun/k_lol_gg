import { createHash, randomUUID } from "node:crypto";
import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { signJobRequest } from "@/modules/operations/infrastructure/job-signature";
import { noStoreJsonResponse } from "@/platform/http";
import { RiotApplicationError, type RiotApplicationService } from "../application/riot-application";

export async function handleRiotSyncCron(request: Request, dependencies: Readonly<{
  cronSecret: string | undefined;
  jobSecret: string | undefined;
  getService: () => Pick<RiotApplicationService, "runNextSync"> | null;
  now?: () => Date;
}>): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/cron/riot-sync" || url.search ||
    !verifyVercelCronBearer(request.headers.get("authorization"), dependencies.cronSecret)) {
    return noStoreJsonResponse({ code: "JOB_AUTH_FAILED" }, { status: 401 });
  }
  try {
    const service = dependencies.getService();
    const secret = dependencies.jobSecret;
    if (!service || !secret || secret.length < 32 || secret.length > 1000) {
      return noStoreJsonResponse({ job: "riot-sync", state: "UNCONFIGURED", processed: 0 });
    }
    const unsigned = { method: "POST" as const, path: "/api/internal/jobs/riot-sync",
      timestampSeconds: Math.floor((dependencies.now?.() ?? new Date()).getTime() / 1000),
      nonce: `riot_cron_${randomUUID().replaceAll("-", "")}`, bodyDigestHex: createHash("sha256").update("{}").digest("hex") };
    const result = await service.runNextSync({ principalId: "job:riot-sync", queueDue: true,
      authorizationIntent: { kind: "SIGNED_JOB", jobName: "riot-sync", transactionRecheck: true,
        nonce: unsigned.nonce, timestampSeconds: unsigned.timestampSeconds, bodyDigestHex: unsigned.bodyDigestHex,
        signatureHex: signJobRequest(unsigned, secret) } });
    return noStoreJsonResponse({ job: "riot-sync", state: result.status, processed: result.status === "PROCESSED" ? 1 : 0,
      ...(result.status === "PROCESSED" ? { outcome: result.body.status } : {}) });
  } catch (error) {
    if (error instanceof RiotApplicationError && error.code === "FEATURE_DISABLED") {
      return noStoreJsonResponse({ job: "riot-sync", state: "DISABLED", processed: 0 });
    }
    return noStoreJsonResponse({ job: "riot-sync", code: "RIOT_SYNC_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "60" } });
  }
}
