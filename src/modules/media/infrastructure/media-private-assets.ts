import "server-only";

import { randomUUID } from "node:crypto";

import { PrivateAssetService } from "@/modules/assets/application/private-asset-service";
import type {
  PrivateAssetInspectionPort,
  PrivateAssetReadGrantPort,
  PrivateAssetStorageKeyPort,
  PrivateAssetStoragePort,
} from "@/modules/assets/application/ports/private-asset-ports";
import { PrivateAssetError, type PrivateAssetInspection } from "@/modules/assets/domain/private-asset";
import { PostgresPrivateAssetAdminAdapter } from "@/modules/assets/infrastructure/postgres-private-asset-admin-adapter";
import { getRuntimePrivateImageStorage } from "@/modules/matches/infrastructure/runtime-private-assets";
import { UnavailablePrivateImageStorage, validatePrivateScoreboardImage } from "@/modules/matches/infrastructure/private-image";
import { getDatabase } from "@/platform/db/client";

export class MediaAssetInspector implements PrivateAssetInspectionPort {
  async inspect(bytes: Uint8Array, declaredContentType: string, signal: AbortSignal): Promise<PrivateAssetInspection> {
    signal.throwIfAborted();
    try {
      const inspected = await validatePrivateScoreboardImage({ bytes, declaredContentType });
      signal.throwIfAborted();
      return {
        contentType: inspected.contentType,
        width: inspected.width,
        height: inspected.height,
        pageCount: 1,
        decoded: true,
      };
    } catch {
      throw new PrivateAssetError("INVALID_INPUT", "업로드 이미지를 안전하게 해석할 수 없습니다.");
    }
  }
}

class DisabledMediaAssetReadGrant implements PrivateAssetReadGrantPort {
  async issue(): Promise<never> {
    throw new PrivateAssetError("STORAGE_UNAVAILABLE", "비공개 자산 read grant가 구성되지 않았습니다.");
  }
}

export const mediaAssetStorageKeys: PrivateAssetStorageKeyPort = {
  create(input) {
    return `media/${input.resourceType.toLocaleLowerCase("en-US")}/${input.resourceId}/${input.purpose.toLocaleLowerCase("en-US")}/${input.assetId}-${input.sha256Hex.slice(0, 16)}`;
  },
};

function service(storage: PrivateAssetStoragePort) {
  const adapter = new PostgresPrivateAssetAdminAdapter(getDatabase());
  return new PrivateAssetService({
    unitOfWork: adapter,
    repository: adapter,
    authorization: adapter,
    audit: adapter.auditPort(),
    inspection: new MediaAssetInspector(),
    storage,
    readGrants: new DisabledMediaAssetReadGrant(),
    assetIds: { nextId: () => randomUUID() },
    eventIds: { nextId: () => randomUUID() },
    storageKeys: mediaAssetStorageKeys,
    clock: { now: () => new Date().toISOString() },
  });
}

export function getRuntimeMediaAssetUploadService() {
  const storage = getRuntimePrivateImageStorage();
  if (!storage) return null;
  try { return service(storage); }
  catch { return null; }
}

export function getRuntimeAdminPrivateAssetService() {
  try { return service(getRuntimePrivateImageStorage() ?? new UnavailablePrivateImageStorage()); }
  catch { return null; }
}

export function isRuntimeMediaAssetUploadAvailable() {
  return getRuntimePrivateImageStorage() !== null;
}
