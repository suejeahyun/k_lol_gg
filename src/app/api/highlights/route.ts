import { MediaServiceError, parseMediaPublicListQuery, toPublicHighlightDto } from "@/modules/media";
import { mediaErrorResponse, mediaReadResponse, mediaUnavailableResponse } from "@/modules/media/infrastructure/media-http";
import { getRuntimeMediaService } from "@/modules/media/infrastructure/runtime-media";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parseMediaPublicListQuery(request.url);
  if (!query) return mediaErrorResponse(new MediaServiceError("INVALID_INPUT", "query"), traceId);
  const service = getRuntimeMediaService();
  if (!service) return mediaUnavailableResponse(traceId);
  try {
    const result = await service.listPublicHighlights(query);
    return mediaReadResponse({
      items: result.items.map((item) => toPublicHighlightDto(item, (id) => `/api/media/assets/${id}`)),
      nextCursor: result.nextCursor,
    }, undefined, traceId);
  } catch (error) { return mediaErrorResponse(error, traceId); }
}
