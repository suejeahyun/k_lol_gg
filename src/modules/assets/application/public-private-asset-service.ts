import { createHash } from "node:crypto";

import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";

import { privateAssetDigestEquals, PrivateAssetError, validateAssetIdentifier } from "../domain/private-asset";
import type { PublicPrivateAssetRepository } from "./ports/public-private-asset-repository";

export type PublishedAssetBytes = Readonly<{
  assetId: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  bytes: Uint8Array;
}>;

export class PublicPrivateAssetService {
  constructor(
    private readonly repository: PublicPrivateAssetRepository,
    private readonly storage: PrivateImageStorage,
  ) {}

  async readPublished(assetId: string): Promise<PublishedAssetBytes> {
    validateAssetIdentifier(assetId, "assetId");
    const asset = await this.repository.findReadyPublished(assetId);
    if (!asset || asset.status !== "READY" || asset.storageProvider !== this.storage.storageProvider) {
      throw new PrivateAssetError("ASSET_NOT_AVAILABLE", "Asset is not available.");
    }
    let bytes: Uint8Array | null = null;
    try {
      bytes = await this.storage.read(asset.storageKey, AbortSignal.timeout(5_000));
    } catch {
      throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Published asset storage is unavailable.");
    }
    if (
      !bytes || bytes.byteLength !== asset.byteSize ||
      !privateAssetDigestEquals(createHash("sha256").update(bytes).digest(), asset.sha256)
    ) {
      throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Published asset failed its integrity check.");
    }
    return Object.freeze({ assetId: asset.id, contentType: asset.contentType, byteSize: asset.byteSize, bytes });
  }
}
