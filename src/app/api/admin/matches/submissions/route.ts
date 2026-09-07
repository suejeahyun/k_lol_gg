import { readValidatedTraceId } from "@/platform/http";
import { parseAdminMatchQuery } from "@/modules/matches/infrastructure/match-query";
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
  const url = new URL(request.url);
  if (url.searchParams.has("view")) return matchInvalidInputResponse(traceId);
  url.searchParams.set("view", "submissions");
  const query = parseAdminMatchQuery(url.toString());
  if (!query) return matchInvalidInputResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    return matchReadResponse(await service.getAdminWorkspace(query), 200, traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
