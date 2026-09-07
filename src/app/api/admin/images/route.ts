import { MediaServiceError, parseMediaAdminListQuery } from "@/modules/media";
import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { mediaErrorResponse, mediaMutationResponse, mediaReadResponse, mediaUnavailableResponse, prepareMediaMutation, requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers); const query = parseMediaAdminListQuery(request.url);
  if (!query) return mediaErrorResponse(new MediaServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(traceId);
  try { return mediaReadResponse(await service.listAdminGalleries(query), undefined, traceId); }
  catch (error) { return mediaErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:galleries:create", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try { return mediaMutationResponse(await service.createGallery(prepared.value.context, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}
