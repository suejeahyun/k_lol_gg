import { parseMmrReviewQuery } from "@/modules/mmr";
import { getRuntimeMmrService } from "@/modules/mmr/infrastructure/runtime-mmr";
import { mmrInvalidInputResponse, mmrReadResponse, mmrUnavailableResponse, requireMmrApiSession } from "@/modules/mmr/infrastructure/mmr-http";
import { readValidatedTraceId } from "@/platform/http";

export async function GET(request: Request) {
  const auth = await requireMmrApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parseMmrReviewQuery(request.url);
  if (!query) return mmrInvalidInputResponse(traceId);
  const service = getRuntimeMmrService();
  if (!service) return mmrUnavailableResponse(traceId);
  try { return mmrReadResponse({ reviews: await service.listAdjustments(query.page, query.pageSize) }, undefined, traceId); }
  catch { return mmrUnavailableResponse(traceId); }
}
