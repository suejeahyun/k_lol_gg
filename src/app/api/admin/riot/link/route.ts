import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:admin:link", { revision: "required" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["playerId", "gameName", "tagLine"]) || typeof body.playerId !== "string" || typeof body.gameName !== "string" || typeof body.tagLine !== "string") return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try { return riotMutationResponse(await runtime.service.connectDirect({ context: prepared.value.context, playerId: body.playerId, expectedRevision: prepared.value.expectedRevision, gameName: body.gameName, tagLine: body.tagLine }), prepared.value.traceId); }
  catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
