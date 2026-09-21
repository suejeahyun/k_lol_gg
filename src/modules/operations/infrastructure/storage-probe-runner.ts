import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";
import type { V2Database } from "@/platform/db/database";
import { jobNonceBindings, maintenanceRuns } from "@/platform/db/schema/operations";
import { runStorageProbe, type StorageProbeResult } from "../application/storage-probe";

const jobName = "storage-probe";
export type StorageProbeJobInput = Readonly<{ nonce: string; requestHashHex: string; requestId: string }>;
export type StorageProbeJobResult = Readonly<{ status: number; body: Readonly<Record<string, unknown>> }>;

/** Runtime credentials and storage selection stay outside this transaction boundary. */
export function createStorageProbeJob(dependencies: Readonly<{
  database: V2Database;
  storage: PrivateImageStorage | null;
  now?: () => Date;
}>) {
  return async (input: StorageProbeJobInput): Promise<StorageProbeJobResult> => {
    const { database, storage } = dependencies;
    if (!storage) return { status: 503, body: { job: jobName, code: "STORAGE_UNAVAILABLE" } };
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(input.requestId) ||
      !/^[A-Za-z0-9_-]{16,100}$/u.test(input.nonce) || !/^[a-f0-9]{64}$/u.test(input.requestHashHex)) throw new Error("INVALID_PROBE_REQUEST");
    const now = dependencies.now?.() ?? new Date();
    const nonceHash = createHash("sha256").update(`${jobName}\0${input.nonce}`).digest();
    const runId = randomUUID();
    const storageProvider = storage.storageProvider === "VERCEL_BLOB_PRIVATE" ? "VERCEL_BLOB_PRIVATE" : "FAKE_LOCAL";
    const providerCounts = { realStorage: Number(storageProvider === "VERCEL_BLOB_PRIVATE") };
    const reserved = await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local lock_timeout = '2s'`);
      await transaction.execute(sql`set local statement_timeout = '8s'`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('klol-storage-probe', 0))`);
      const previous = (await transaction.select({ id: jobNonceBindings.id }).from(jobNonceBindings).where(and(eq(jobNonceBindings.jobName, jobName), eq(jobNonceBindings.nonceHash, nonceHash))).limit(1))[0];
      if (previous) return "REPLAY" as const;
      const recent = (await transaction.select({ id: maintenanceRuns.id }).from(maintenanceRuns).where(and(eq(maintenanceRuns.jobName, jobName), gte(maintenanceRuns.startedAt, new Date(now.getTime() - 5 * 60_000)))).orderBy(desc(maintenanceRuns.startedAt)).limit(1))[0];
      if (recent) return "RATE_LIMIT" as const;
      await transaction.insert(jobNonceBindings).values({ id: randomUUID(), jobName, nonceHash, requestHash: Buffer.from(input.requestHashHex, "hex"), createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60_000) });
      await transaction.insert(maintenanceRuns).values({ id: runId, requestId: input.requestId, jobName, status: "RUNNING", countsJson: providerCounts, startedAt: now });
      return "CLAIMED" as const;
    });
    if (reserved !== "CLAIMED") return { status: reserved === "REPLAY" ? 409 : 429, body: { job: jobName, code: reserved } };
    let result: StorageProbeResult;
    try { result = await runStorageProbe(storage, input.requestId); }
    catch {
      result = { ok: false, counts: { uploaded: 0, verified: 0, deleted: 0, deletionVerified: 0 }, failureCode: "STORAGE_PROBE_FAILED" };
    }
    await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local lock_timeout = '2s'`);
      await transaction.execute(sql`set local statement_timeout = '8s'`);
      await transaction.update(maintenanceRuns).set({ status: result.ok ? "SUCCEEDED" : "FAILED",
        countsJson: { ...result.counts, ...providerCounts }, failureCode: result.failureCode,
        completedAt: dependencies.now?.() ?? new Date() }).where(eq(maintenanceRuns.id, runId));
    });
    return { status: result.ok ? 200 : 503, body: { job: jobName, runId, storageProvider, ...result } };
  };
}
