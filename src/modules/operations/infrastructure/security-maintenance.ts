import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { PostgresAuthRepository } from "@/modules/auth/infrastructure/postgres-auth-repository";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";
import { runMediaAssetCleanup } from "@/modules/media/infrastructure/media-asset-maintenance";
import type { V2Database } from "@/platform/db/database";
import { maintenanceRuns } from "@/platform/db/schema/operations";

const JOB_NAME = "security-maintenance";
const AUTH_RETENTION_MS = 30 * 86_400_000;

export async function runSecurityMaintenance(database: V2Database, storage: PrivateImageStorage | null, now = new Date()) {
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const runId = await database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JOB_NAME}, 0))`);
    const recent = await transaction.select({ status: maintenanceRuns.status, startedAt: maintenanceRuns.startedAt }).from(maintenanceRuns)
      .where(and(eq(maintenanceRuns.jobName, JOB_NAME), gte(maintenanceRuns.startedAt, dayStart)));
    if (recent.some((run) => run.status === "SUCCEEDED")) return null;
    if (recent.some((run) => run.status === "RUNNING" && run.startedAt.getTime() > now.getTime() - 5 * 60_000)) throw new Error("MAINTENANCE_BUSY");
    await transaction.update(maintenanceRuns).set({ status: "FAILED", failureCode: "INTERRUPTED", completedAt: now })
      .where(and(eq(maintenanceRuns.jobName, JOB_NAME), eq(maintenanceRuns.status, "RUNNING")));
    const id = randomUUID();
    await transaction.insert(maintenanceRuns).values({ id, requestId: randomUUID(), jobName: JOB_NAME, status: "RUNNING", countsJson: {}, startedAt: now });
    return id;
  });
  if (!runId) return { replayed: true };
  try {
    const retainedBefore = new Date(now.getTime() - AUTH_RETENTION_MS);
    const auth = await new PostgresAuthRepository(database).cleanupExpiredAuthState({ now, expiredBefore: retainedBefore, revokedBefore: retainedBefore, limit: 1_000 });
    const media = storage ? await runMediaAssetCleanup(database, storage, now) : { mediaUnavailable: 1 };
    const counts = { ...auth, ...media };
    const failed = !storage || ("mediaFailed" in media && media.mediaFailed > 0);
    await database.update(maintenanceRuns).set({ status: failed ? "FAILED" : "SUCCEEDED", failureCode: failed ? "MEDIA_CLEANUP_UNAVAILABLE" : null, countsJson: counts, completedAt: new Date() }).where(eq(maintenanceRuns.id, runId));
    return { replayed: false, ...counts, failed };
  } catch {
    await database.update(maintenanceRuns).set({ status: "FAILED", failureCode: "MAINTENANCE_FAILED", completedAt: new Date() }).where(eq(maintenanceRuns.id, runId));
    throw new Error("SECURITY_MAINTENANCE_FAILED");
  }
}
