import { randomUUID } from "node:crypto";

import { PrivateAssetError, type PrivateAssetInspection } from "@/modules/assets/domain/private-asset";
import type {
  PrivateAssetIdentityPort,
  PrivateAssetInspectionPort,
  PrivateAssetReadGrantPort,
  PrivateAssetStorageKeyPort,
  PrivateAssetStoragePort,
} from "@/modules/assets/application/ports/private-asset-ports";
import {
  UnavailablePrivateImageStorage,
  fakePrivateAdaptersAllowed,
  validatePrivateScoreboardImage,
} from "@/modules/matches/infrastructure/private-image";
import { getRuntimePrivateAdapters } from "@/modules/matches/infrastructure/runtime-private-assets";

export class DisciplineAssetInspector implements PrivateAssetInspectionPort {
  async inspect(bytes: Uint8Array, declaredContentType: string, signal: AbortSignal): Promise<PrivateAssetInspection> {
    signal.throwIfAborted();
    try {
      const inspected = await validatePrivateScoreboardImage({ bytes, declaredContentType });
      return {
        contentType: inspected.contentType,
        width: inspected.width,
        height: inspected.height,
        pageCount: 1,
        decoded: true,
      };
    } catch {
      throw new PrivateAssetError("INVALID_INPUT", "The evidence image is invalid.");
    }
  }
}

export class DisabledPrivateAssetReadGrant implements PrivateAssetReadGrantPort {
  async issue(): Promise<never> {
    throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Private read grants are not configured.");
  }
}

export const randomAssetIdentity: PrivateAssetIdentityPort = { nextId: () => randomUUID() };

export const disciplineAssetStorageKeys: PrivateAssetStorageKeyPort = {
  create(input) {
    return `discipline/${input.resourceId}/${input.assetId}/${input.sha256Hex.slice(0, 16)}`;
  },
};

export function createRuntimeDisciplineAssetStorage(): PrivateAssetStoragePort {
  return fakePrivateAdaptersAllowed()
    ? getRuntimePrivateAdapters()?.storage ?? new UnavailablePrivateImageStorage()
    : new UnavailablePrivateImageStorage();
}
