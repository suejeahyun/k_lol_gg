import { readValidatedTraceId } from "@/platform/http";
import { parseAdminKakaoPendingQuery } from "@/modules/seasons/infrastructure/admin-kakao-pending-query";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  requireSeasonApiSession,
  seasonReadResponse,
  seasonServiceErrorResponse,
  seasonUnavailableResponse,
} from "@/modules/seasons/infrastructure/season-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireSeasonApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(traceId);
  try {
    return seasonReadResponse(await service.getKakaoPendingApplications(parseAdminKakaoPendingQuery(request.url)), 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}
