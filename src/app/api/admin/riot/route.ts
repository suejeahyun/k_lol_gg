import { parseAdminRiotQuery } from "@/modules/riot";
import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRiotApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers); const query = parseAdminRiotQuery(request.url);
  if (!query) return riotInvalidInputResponse(traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(traceId);
  try { return riotReadResponse(await runtime.query.listAdmin(query), undefined, traceId); }
  catch (error) { return riotErrorResponse(error, traceId); }
}
