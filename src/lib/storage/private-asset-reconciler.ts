import { randomUUID } from "node:crypto";
import { resolvePrivateAssetLifecycle } from "@/lib/storage/private-asset-lifecycle";

type DbAssetMetadata = {
  storageKey: string;
  expiresAt: Date | string | null;
  deletedAt: Date | string | null;
  relationCount: number;
};

export type PrivateAssetReadAdapter = {
  listAssetMetadata: () => Promise<DbAssetMetadata[]>;
  listObjectKeys: () => Promise<string[]>;
};

export type PrivateAssetDryRunManifest = {
  schemaVersion: 1;
  runId: string;
  mode: "DRY_RUN";
  generatedAt: string;
  criteria: "expiresAt<=now; no writes";
  counts: {
    ACTIVE: number;
    EXPIRED: number;
    LEGACY_NO_EXPIRY: number;
    DB_ONLY: number;
    BLOB_ONLY: number;
    DELETED: number;
    RELATION_PRESENT: number;
    ERROR: number;
  };
  mutations: 0;
};

export async function runPrivateAssetDryRun(
  adapter: PrivateAssetReadAdapter,
  now = new Date(),
): Promise<PrivateAssetDryRunManifest> {
  const [dbAssets, objectKeys] = await Promise.all([
    adapter.listAssetMetadata(),
    adapter.listObjectKeys(),
  ]);
  const objectKeySet = new Set(objectKeys);
  const dbKeySet = new Set(dbAssets.map((asset) => asset.storageKey));
  const counts: PrivateAssetDryRunManifest["counts"] = {
    ACTIVE: 0,
    EXPIRED: 0,
    LEGACY_NO_EXPIRY: 0,
    DB_ONLY: 0,
    BLOB_ONLY: 0,
    DELETED: 0,
    RELATION_PRESENT: 0,
    ERROR: 0,
  };

  for (const asset of dbAssets) {
    const state = resolvePrivateAssetLifecycle(asset, now);
    counts[state === "ACTIVE" || state === "EXPIRED" || state === "DELETED" ? state : "ERROR"] += 1;
    if (!asset.expiresAt && state === "ACTIVE") counts.LEGACY_NO_EXPIRY += 1;
    if (!objectKeySet.has(asset.storageKey) && state !== "DELETED") counts.DB_ONLY += 1;
    if (asset.relationCount > 0) counts.RELATION_PRESENT += 1;
  }

  counts.BLOB_ONLY = objectKeys.filter((key) => !dbKeySet.has(key)).length;

  return {
    schemaVersion: 1,
    runId: randomUUID(),
    mode: "DRY_RUN",
    generatedAt: now.toISOString(),
    criteria: "expiresAt<=now; no writes",
    counts,
    mutations: 0,
  };
}
