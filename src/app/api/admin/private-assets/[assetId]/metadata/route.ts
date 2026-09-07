import { PrivateAssetError } from "@/modules/assets/domain/private-asset";
import { requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";
import {
  adminPrivateAssetActor,
  privateAssetErrorResponse,
  privateAssetJsonResponse,
  privateAssetUnavailableResponse,
} from "@/modules/media/infrastructure/media-asset-http";
import { getRuntimeAdminPrivateAssetService } from "@/modules/media/infrastructure/media-private-assets";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const auth = await requireMediaAdminSession();
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return privateAssetErrorResponse(new PrivateAssetError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeAdminPrivateAssetService();
  if (!service) return privateAssetUnavailableResponse(traceId);
  try {
    const asset = await service.metadata(adminPrivateAssetActor(auth.session), (await context.params).assetId);
    return privateAssetJsonResponse({ asset }, traceId);
  } catch (error) { return privateAssetErrorResponse(error, traceId); }
}
