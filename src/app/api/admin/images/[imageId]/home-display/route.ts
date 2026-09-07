import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { mediaErrorResponse, mediaMutationResponse, mediaUnavailableResponse, prepareMediaMutation, requireMediaAdminSession } from "@/modules/media/infrastructure/media-http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ imageId: string }> }) {
  const auth = await requireMediaAdminSession(); if (!auth.ok) return auth.response;
  const prepared = await prepareMediaMutation(request, "media:galleries:home-display", auth.session); if (!prepared.ok) return prepared.response;
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(prepared.value.traceId);
  try { return mediaMutationResponse(await service.setGalleryHomeDisplay(prepared.value.context, (await context.params).imageId, prepared.value.expectedRevision, prepared.value.body), prepared.value.traceId); }
  catch (error) { return mediaErrorResponse(error, prepared.value.traceId); }
}
