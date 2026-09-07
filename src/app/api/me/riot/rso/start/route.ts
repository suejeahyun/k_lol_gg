import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:rso:start", { revision: "none" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!(exactObject(body, []) || exactObject(body, ["returnTo"])) || ("returnTo" in (body as object) && typeof (body as { returnTo?: unknown }).returnTo !== "string")) return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const result = await runtime.service.startRso({ context: prepared.value.context, returnTo: (body as { returnTo?: string }).returnTo });
    return riotMutationResponse(result, prepared.value.traceId, { ...result.body, authorizationUrl: result.authorizationUrl, returnTo: result.returnTo });
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
