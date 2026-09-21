import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import { jobNonceBindings, maintenanceRuns, siteSettings } from "@/platform/db/schema/operations";
import { verifyJobRequest } from "@/modules/operations/infrastructure/job-signature";
import type { RiotApiProbeInput } from "./riot-api-probe-http";
import type { RiotProductionConfiguration } from "./riot-runtime-policy";
import { probeRiotApiKey } from "./riot-api-probe";

export async function runPostgresRiotApiProbe(input: RiotApiProbeInput, dependencies: Readonly<{
  database: V2Database;
  configuration: RiotProductionConfiguration;
  fetch?: typeof fetch;
}>) {
  const jobName = "riot-api-probe";
  const { database, configuration } = dependencies;
  const nonceHash = createHash("sha256").update(`${jobName}\0${input.nonce}`).digest();
  const runId = randomUUID();
  const reserved = await database.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL statement_timeout = '8s'`);
    await transaction.execute(sql`SET LOCAL lock_timeout = '2s'`);
    const verified = verifyJobRequest({ request: { method: "POST", path: "/api/internal/jobs/riot-api-probe",
      timestampSeconds: input.timestampSeconds, nonce: input.nonce, bodyDigestHex: input.bodyDigestHex, signatureHex: input.signatureHex },
      secret: configuration.jobSecret, now: new Date(), nonceAlreadyUsed: false });
    if (!verified.ok) return "UNAUTHORIZED" as const;
    const settings = (await transaction.select({ features: siteSettings.featuresJson }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
    if (settings?.features.riotIntegration !== true) return "DISABLED" as const;
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('klol-riot-api-probe', 0))`);
    const prior = (await transaction.select({ id: jobNonceBindings.id }).from(jobNonceBindings)
      .where(and(eq(jobNonceBindings.jobName, jobName), eq(jobNonceBindings.nonceHash, nonceHash))).limit(1))[0];
    if (prior) return "REPLAY" as const;
    const now = new Date();
    const recent = (await transaction.select({ id: maintenanceRuns.id }).from(maintenanceRuns)
      .where(and(eq(maintenanceRuns.jobName, jobName), gte(maintenanceRuns.startedAt, new Date(now.getTime() - 300_000)))).limit(1))[0];
    if (recent) return "RATE_LIMIT" as const;
    await transaction.insert(jobNonceBindings).values({ id: randomUUID(), jobName, nonceHash, requestHash: Buffer.from(input.bodyDigestHex, "hex"),
      createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60_000) });
    await transaction.insert(maintenanceRuns).values({ id: runId, requestId: input.requestId, jobName, status: "RUNNING", startedAt: now, countsJson: { requests: 1 } });
    return "CLAIMED" as const;
  });
  if (reserved !== "CLAIMED") return { status: reserved === "UNAUTHORIZED" ? 401 : reserved === "DISABLED" ? 403 : reserved === "REPLAY" ? 409 : 429,
    body: { job: jobName, code: reserved } };
  const result = await probeRiotApiKey(configuration.apiKey, dependencies.fetch);
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL statement_timeout = '8s'`);
    await transaction.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await transaction.update(maintenanceRuns).set({ status: result.ok ? "SUCCEEDED" : "FAILED", completedAt: new Date(),
      countsJson: { requests: 1, statusEndpointAccepted: Number(result.ok), providerStatus: result.providerStatus ?? 0 },
      failureCode: result.ok ? null : result.code }).where(eq(maintenanceRuns.id, runId));
  });
  return { status: result.ok ? 200 : 503, body: { job: jobName, ...result } };
}
