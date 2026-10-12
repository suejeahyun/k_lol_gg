import { randomUUID } from "node:crypto";
import { PrivateAssetService } from "@/modules/assets/application/private-asset-service";
import { MEDIA_CLEANUP_PRINCIPAL, PostgresPrivateAssetAdminAdapter } from "@/modules/assets/infrastructure/postgres-private-asset-admin-adapter";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";
import type { V2Database } from "@/platform/db/database";

export const MEDIA_DELETE_RETENTION_MS = 7 * 86_400_000;
export const MEDIA_STALE_STAGE_MS = 86_400_000;

export function createMediaAssetCleanupService(database: V2Database, storage: PrivateImageStorage, now: Date) {
  const adapter = new PostgresPrivateAssetAdminAdapter(database, new Date(now.getTime() - MEDIA_DELETE_RETENTION_MS));
  return new PrivateAssetService({
    unitOfWork: adapter, repository: adapter, authorization: adapter, audit: adapter.auditPort(), storage,
    inspection: { async inspect() { throw new Error("CLEANUP_ONLY"); } },
    readGrants: { async issue() { throw new Error("CLEANUP_ONLY"); } },
    assetIds: { nextId: randomUUID }, eventIds: { nextId: randomUUID },
    storageKeys: { create() { throw new Error("CLEANUP_ONLY"); } },
    clock: { now: () => now.toISOString() },
  });
}

export async function runMediaAssetCleanup(database: V2Database, storage: PrivateImageStorage, now: Date) {
  const service = createMediaAssetCleanupService(database, storage, now);
  const actor = { purpose: "JOB", principalId: MEDIA_CLEANUP_PRINCIPAL, role: "SYSTEM" } as const;
  const recovered = await service.recoverStaleStages(actor, new Date(now.getTime() - MEDIA_STALE_STAGE_MS).toISOString(), 20);
  const plans = await service.planCleanup(actor, 20);
  const deadline = Date.now() + 40_000;
  let succeeded = 0, failed = 0;
  for (const plan of plans) {
    if (Date.now() >= deadline) break;
    try { await service.executeCleanup(actor, plan); succeeded += 1; }
    catch { failed += 1; }
  }
  return { mediaRecovered: recovered.length, mediaSelected: plans.length, mediaDeleted: succeeded, mediaFailed: failed, mediaDeferred: plans.length - succeeded - failed };
}
