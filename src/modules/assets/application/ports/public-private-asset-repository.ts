import type { PrivateAssetRecord } from "../../domain/private-asset";

export interface PublicPrivateAssetRepository {
  /** Returns an internal locator only for a READY asset bound to currently PUBLISHED media. */
  findReadyPublished(assetId: string): Promise<PrivateAssetRecord | null>;
}
