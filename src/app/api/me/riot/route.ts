import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotNotFoundResponse, riotReadResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return riotInvalidInputResponse(traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(traceId);
  try { const status = await runtime.query.getOwnerStatus(auth.session.userId); return status ? riotReadResponse({ status }, status.link?.revision, traceId) : riotNotFoundResponse(traceId); }
  catch (error) { return riotErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:link:direct", { revision: "required" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["gameName", "tagLine"]) || typeof body.gameName !== "string" || typeof body.tagLine !== "string") return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.connectDirect({ context: prepared.value.context, playerId: owner.playerId, expectedRevision: prepared.value.expectedRevision, gameName: body.gameName, tagLine: body.tagLine }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}

export async function DELETE(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:link:disconnect", { revision: "required" }); if (!prepared.ok) return prepared.response;
  if (!exactObject(prepared.value.body, [])) return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.disconnect({ context: prepared.value.context, playerId: owner.playerId, expectedRevision: prepared.value.expectedRevision }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
