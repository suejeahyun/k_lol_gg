import { readValidatedTraceId } from "@/platform/http";
import { parseCandidateQuery } from "@/modules/seasons/infrastructure/admin-kakao-pending-query";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  requireSeasonApiSession,
  seasonReadResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ pendingId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireSeasonApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(traceId);
  try {
    const { pendingId } = await context.params;
    return seasonReadResponse(await service.getKakaoPendingApplication(pendingId, parseCandidateQuery(request.url)), 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}
