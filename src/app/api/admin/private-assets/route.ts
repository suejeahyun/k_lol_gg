import { PrivateAssetError } from "@/modules/assets/domain/private-asset";
import { requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";
import {
  adminPrivateAssetActor,
  parsePrivateAssetAdminListQuery,
  privateAssetErrorResponse,
  privateAssetJsonResponse,
  privateAssetUnavailableResponse,
} from "@/modules/media/infrastructure/media-asset-http";
import { getRuntimeAdminPrivateAssetService } from "@/modules/media/infrastructure/media-private-assets";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMediaAdminSession();
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parsePrivateAssetAdminListQuery(request.url);
  if (!query) return privateAssetErrorResponse(new PrivateAssetError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeAdminPrivateAssetService();
  if (!service) return privateAssetUnavailableResponse(traceId);
  try { return privateAssetJsonResponse(await service.list(adminPrivateAssetActor(auth.session), query), traceId); }
  catch (error) { return privateAssetErrorResponse(error, traceId); }
}
