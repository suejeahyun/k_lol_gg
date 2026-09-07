import { PrivateAssetError, type PrivateAssetBinding } from "../domain/private-asset";

export type PublicAssetDto = Readonly<{
  assetId: string;
  purpose: "GALLERY" | "HIGHLIGHT_THUMBNAIL";
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
}>;

export type PrivateAssetReadGrantDto = Readonly<{
  assetId: string;
  purpose: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFileName: string | null;
  readGrant: string;
  expiresAt: string;
}>;

export type PrivateAssetMetadataDto = Readonly<{
  assetId: string;
  resourceType: string;
  resourceId: string;
  purpose: string;
  status: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  createdAt: string;
  readyAt: string | null;
  deleteRequestedAt: string | null;
}>;

export function toPublicAssetDto(binding: PrivateAssetBinding): PublicAssetDto {
  const { asset } = binding;
  if (
    asset.status !== "READY" ||
    !binding.public ||
    (asset.purpose !== "GALLERY" && asset.purpose !== "HIGHLIGHT_THUMBNAIL")
  ) {
    throw new PrivateAssetError("ASSET_NOT_AVAILABLE", "Asset is not available.");
  }
  return Object.freeze({
    assetId: asset.id,
    purpose: asset.purpose,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt,
  });
}

export function toPrivateAssetReadGrantDto(
  binding: PrivateAssetBinding,
  grant: Readonly<{ readGrant: string; expiresAt: string }>,
): PrivateAssetReadGrantDto {
  if (binding.asset.status !== "READY") {
    throw new PrivateAssetError("ASSET_NOT_AVAILABLE", "Asset is not available.");
  }
  return Object.freeze({
    assetId: binding.asset.id,
    purpose: binding.asset.purpose,
    contentType: binding.asset.contentType,
    byteSize: binding.asset.byteSize,
    width: binding.asset.width,
    height: binding.asset.height,
    originalFileName: binding.asset.originalFileName,
    readGrant: grant.readGrant,
    expiresAt: grant.expiresAt,
  });
}

export function toPrivateAssetMetadataDto(binding: PrivateAssetBinding): PrivateAssetMetadataDto {
  return Object.freeze({
    assetId: binding.asset.id,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    purpose: binding.asset.purpose,
    status: binding.asset.status,
    contentType: binding.asset.contentType,
    byteSize: binding.asset.byteSize,
    width: binding.asset.width,
    height: binding.asset.height,
    createdAt: binding.asset.createdAt,
    readyAt: binding.asset.readyAt,
    deleteRequestedAt: binding.asset.deleteRequestedAt,
  });
}
