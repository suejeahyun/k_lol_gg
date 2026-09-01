import { readValidatedTraceId } from "@/platform/http";
import { SeasonServiceError } from "@/modules/seasons";
import { parseAdminSeasonQuery } from "@/modules/seasons/infrastructure/admin-season-query";
import { getRuntimeSeasonService } from "@/modules/seasons/infrastructure/runtime-season-data";
import {
  prepareSeasonMutation,
  requireSeasonApiSession,
  seasonMutationResponse,
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
    return seasonReadResponse(await service.getAdminWorkspace(parseAdminSeasonQuery(request.url)), 200, traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}

export async function POST(request: Request) {
  const authorization = await requireSeasonApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareSeasonMutation(request, "admin:seasons:create", authorization.session.userId);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeSeasonService();
  if (!service) return seasonUnavailableResponse(prepared.value.traceId);
  try {
    if (prepared.value.expectedRevision !== 0) {
      throw new SeasonServiceError("PRECONDITION_FAILED", "새 시즌은 revision 0에서 생성합니다.");
    }
    const result = await service.createSeason(prepared.value.context, prepared.value.body);
    return seasonMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return seasonServiceErrorResponse(error, prepared.value.traceId);
  }
}
