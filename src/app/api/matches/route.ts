import { readValidatedTraceId } from "@/platform/http";
import { parsePublicMatchQuery } from "@/modules/matches/infrastructure/match-query";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const query = parsePublicMatchQuery(request.url);
  if (!query) return matchInvalidInputResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    return matchReadResponse(await service.listPublic(query), 200, traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
