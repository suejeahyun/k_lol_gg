import { readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !["after", "pageSize"].includes(key) || params.getAll(key).length !== 1)) {
    return matchInvalidInputResponse(traceId);
  }
  const after = params.get("after");
  const pageSizeValue = params.get("pageSize");
  const pageSize = pageSizeValue === null ? 200 : /^\d{1,3}$/.test(pageSizeValue) ? Number(pageSizeValue) : null;
  if (pageSize === null || pageSize < 1 || pageSize > 500) return matchInvalidInputResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    return matchReadResponse(await service.getMatchSummaryIntegrity(after, pageSize), 200, traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
