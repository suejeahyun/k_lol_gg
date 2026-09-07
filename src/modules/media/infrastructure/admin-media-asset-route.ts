import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { PrivateAssetError, type PrivateAssetPurpose, type PrivateAssetResourceType } from "@/modules/assets/domain/private-asset";

import { getRuntimeMediaService } from "./runtime-media";
import { getRuntimeAdminPrivateAssetService, getRuntimeMediaAssetUploadService } from "./media-private-assets";
import {
  adminPrivateAssetActor,
  prepareMediaAssetUpload,
  privateAssetErrorResponse,
  privateAssetJsonResponse,
  privateAssetPreconditionResponse,
  privateAssetUnavailableResponse,
} from "./media-asset-http";
import { readValidatedTraceId } from "@/platform/http";

type MediaAssetResource = Readonly<{
  resourceType: Extract<PrivateAssetResourceType, "HIGHLIGHT" | "GALLERY_ENTRY">;
  purpose: Extract<PrivateAssetPurpose, "HIGHLIGHT_THUMBNAIL" | "GALLERY">;
}>;

export async function listMediaDraftAssets(
  request: Request,
  session: AuthSession,
  resourceId: string,
  resource: MediaAssetResource,
) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) {
    return privateAssetErrorResponse(new PrivateAssetError("INVALID_INPUT", "query"), traceId);
  }
  const service = getRuntimeAdminPrivateAssetService();
  if (!service) return privateAssetUnavailableResponse(traceId);
  try {
    const result = await service.list(adminPrivateAssetActor(session), {
      purpose: resource.purpose,
      status: "READY",
      resourceType: resource.resourceType,
      resourceId,
      pageSize: resource.purpose === "GALLERY" ? 20 : 10,
    });
    return privateAssetJsonResponse({ items: result.items }, traceId);
  } catch (error) { return privateAssetErrorResponse(error, traceId); }
}

export async function uploadMediaDraftAsset(
  request: Request,
  session: AuthSession,
  resourceId: string,
  resource: MediaAssetResource,
) {
  const prepared = prepareMediaAssetUpload(request);
  if (!prepared.ok) return prepared.response;
  const media = getRuntimeMediaService();
  const assets = getRuntimeMediaAssetUploadService();
  if (!media || !assets) return privateAssetUnavailableResponse(prepared.value.traceId);
  try {
    const draft = resource.resourceType === "HIGHLIGHT"
      ? await media.getAdminHighlight(resourceId)
      : await media.getAdminGallery(resourceId);
    if (!draft) throw new PrivateAssetError("ASSET_NOT_AVAILABLE", "Media draft is not available.");
    if (draft.status !== "DRAFT" || draft.revision !== prepared.value.expectedRevision) {
      return privateAssetPreconditionResponse(prepared.value.traceId);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength !== prepared.value.byteSize) {
      throw new PrivateAssetError("INVALID_INPUT", "Uploaded bytes do not match the declared size.");
    }
    const actor = adminPrivateAssetActor(session);
    const staged = await assets.stage({
      actor,
      resourceType: resource.resourceType,
      resourceId,
      purpose: resource.purpose,
      bytes,
      declaredContentType: prepared.value.contentType,
      declaredSha256Hex: prepared.value.sha256Hex,
      originalFileName: prepared.value.originalFileName,
    });
    const ready = await assets.finalize(actor, staged.assetId);
    return privateAssetJsonResponse({ asset: ready }, prepared.value.traceId, 201);
  } catch (error) { return privateAssetErrorResponse(error, prepared.value.traceId); }
}
