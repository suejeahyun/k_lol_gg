import { MediaServiceError, toPublicHighlightDto } from "@/modules/media";
import { mediaErrorResponse, mediaReadResponse, mediaUnavailableResponse } from "@/modules/media/infrastructure/media-http";
import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ highlightId: string }> }) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return mediaErrorResponse(new MediaServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeMediaService(); if (!service) return mediaUnavailableResponse(traceId);
  try {
    const item = await service.getPublicHighlight((await context.params).highlightId);
    if (!item) throw new MediaServiceError("NOT_FOUND", "missing");
    return mediaReadResponse({ highlight: toPublicHighlightDto(item, (id) => `/api/media/assets/${id}`) }, item.revision, traceId);
  } catch (error) { return mediaErrorResponse(error, traceId); }
}
