import { createHash, randomUUID } from "node:crypto";
import { verifyVercelCronBearer } from "@/modules/operations/infrastructure/vercel-kakao-daily-close";
import { signJobRequest } from "@/modules/operations/infrastructure/job-signature";
import { noStoreJsonResponse } from "@/platform/http";
import { RiotApplicationError, type RiotApplicationService } from "../application/riot-application";

const MAXIMUM_JOBS = 4;
// The route allows 60s. Stop admitting work after 20s, reserving time for an
// already claimed job's bounded rank/analytics requests and final transaction.
const CLAIM_BUDGET_MS = 20_000;

export async function handleRiotSyncCron(request: Request, dependencies: Readonly<{
  cronSecret: string | undefined;
  jobSecret: string | undefined;
  getService: () => Pick<RiotApplicationService, "runNextSync"> | null;
  now?: () => Date;
  monotonicNow?: () => number;
}>): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/cron/riot-sync" || url.search ||
    !verifyVercelCronBearer(request.headers.get("authorization"), dependencies.cronSecret)) {
    return noStoreJsonResponse({ code: "JOB_AUTH_FAILED" }, { status: 401 });
  }
  let processed = 0;
  try {
    const service = dependencies.getService();
    const secret = dependencies.jobSecret;
    if (!service || !secret || secret.length < 32 || secret.length > 1000) {
      return noStoreJsonResponse({ job: "riot-sync", state: "UNCONFIGURED", processed: 0 });
    }
    const clock = dependencies.monotonicNow ?? (() => performance.now());
    const startedAt = clock();
    let outcome: string | undefined;
    let stopped = "LIMIT";
    while (processed < MAXIMUM_JOBS) {
      if (clock() - startedAt >= CLAIM_BUDGET_MS) { stopped = "TIME_BUDGET"; break; }
      // Nonces authorize one claim/finish pair; never reuse one across jobs.
      const unsigned = { method: "POST" as const, path: "/api/internal/jobs/riot-sync",
        timestampSeconds: Math.floor((dependencies.now?.() ?? new Date()).getTime() / 1000),
        nonce: `riot_cron_${randomUUID().replaceAll("-", "")}`, bodyDigestHex: createHash("sha256").update("{}").digest("hex") };
      const result = await service.runNextSync({ principalId: "job:riot-sync", queueDue: true,
        authorizationIntent: { kind: "SIGNED_JOB", jobName: "riot-sync", transactionRecheck: true,
          nonce: unsigned.nonce, timestampSeconds: unsigned.timestampSeconds, bodyDigestHex: unsigned.bodyDigestHex,
          signatureHex: signJobRequest(unsigned, secret) } });
      if (result.status === "IDLE") { stopped = "IDLE"; break; }
      processed++;
      const status = result.body.status;
      if (typeof status !== "string" || !["SUCCEEDED", "CANCELLED", "RETRY_WAIT", "PARTIAL", "FAILED"].includes(status)) {
        throw new Error("INVALID_RIOT_SYNC_OUTCOME");
      }
      outcome = status;
      // Respect provider rate limits and errors, including terminal exhausted
      // attempts. Do not spend the remainder of the run on other accounts.
      if (!["SUCCEEDED", "CANCELLED"].includes(status)) { stopped = status; break; }
    }
    return noStoreJsonResponse({ job: "riot-sync", state: processed > 0 ? "PROCESSED" : "IDLE", processed, stopped,
      ...(outcome ? { outcome } : {}) });
  } catch (error) {
    if (error instanceof RiotApplicationError && error.code === "FEATURE_DISABLED") {
      return noStoreJsonResponse({ job: "riot-sync", state: "DISABLED", processed });
    }
    return noStoreJsonResponse({ job: "riot-sync", code: "RIOT_SYNC_UNAVAILABLE", processed }, { status: 503, headers: { "Retry-After": "60" } });
  }
}
