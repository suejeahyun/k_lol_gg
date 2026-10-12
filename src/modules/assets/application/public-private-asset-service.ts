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
    private readonly renderPublicImage: (bytes: Uint8Array) => Promise<Readonly<{ bytes: Uint8Array; contentType: "image/webp" }>>,
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
    try {
      const derivative = await this.renderPublicImage(bytes);
      return Object.freeze({ assetId: asset.id, contentType: derivative.contentType, byteSize: derivative.bytes.byteLength, bytes: derivative.bytes });
    } catch {
      throw new PrivateAssetError("STORAGE_UNAVAILABLE", "Published image could not be prepared.");
    }
  }
}
