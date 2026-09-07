import { MediaServiceError } from "@/modules/media";
import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { isMediaTransitionBody, mediaErrorResponse, mediaMutationResponse, mediaReadResponse, mediaUnavailableResponse, prepareMediaMutation, requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return mediaErrorResponse(new MediaServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(traceId);
  try { const item = await service.getAdminHighlight((await context.params).highlightId); if (!item) throw new MediaServiceError("NOT_FOUND", "missing"); return mediaReadResponse({ highlight: item }, item.revision, traceId); }
  catch (error) { return mediaErrorResponse(error, traceId); }
}

export async function PATCH(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:highlights:patch", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try {
    const id = (await context.params).highlightId;
    const result = isMediaTransitionBody(prepared.value.body)
      ? service.transitionHighlight(prepared.value.context, id, prepared.value.expectedRevision, prepared.value.body)
      : service.updateHighlight(prepared.value.context, id, prepared.value.expectedRevision, prepared.value.body);
    return mediaMutationResponse(await result, prepared.value.traceId);
  } catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}

export async function DELETE(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:highlights:archive", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try { return mediaMutationResponse(await service.archiveHighlight(prepared.value.context, (await context.params).highlightId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}
