import { readValidatedTraceId } from "@/platform/http";
import { parseAdminSeasonQuery } from "@/modules/seasons/infrastructure/admin-season-query";
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
    const workspace = await service.getAdminWorkspace(parseAdminSeasonQuery(request.url));
    return seasonReadResponse(
      {
        applications: workspace.applications,
        page: workspace.applicationPage,
        pageSize: workspace.applicationPageSize,
        totalCount: workspace.applicationTotalCount,
        totalPages: workspace.applicationTotalPages,
      },
      200,
      traceId,
    );
  } catch (error) {
    return seasonServiceErrorResponse(error, traceId);
  }
}
