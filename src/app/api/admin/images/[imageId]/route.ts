import { MediaServiceError } from "@/modules/media";
import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { isMediaTransitionBody, mediaErrorResponse, mediaMutationResponse, mediaReadResponse, mediaUnavailableResponse, prepareMediaMutation, requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return mediaErrorResponse(new MediaServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(traceId);
  try { const item = await service.getAdminGallery((await context.params).imageId); if (!item) throw new MediaServiceError("NOT_FOUND", "missing"); return mediaReadResponse({ gallery: item }, item.revision, traceId); }
  catch (error) { return mediaErrorResponse(error, traceId); }
}

export async function PATCH(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:galleries:patch", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try {
    const id = (await context.params).imageId;
    const result = isMediaTransitionBody(prepared.value.body)
      ? service.transitionGallery(prepared.value.context, id, prepared.value.expectedRevision, prepared.value.body)
      : service.updateGallery(prepared.value.context, id, prepared.value.expectedRevision, prepared.value.body);
    return mediaMutationResponse(await result, prepared.value.traceId);
  } catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}

export async function DELETE(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:galleries:archive", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try { return mediaMutationResponse(await service.archiveGallery(prepared.value.context, (await context.params).imageId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}
