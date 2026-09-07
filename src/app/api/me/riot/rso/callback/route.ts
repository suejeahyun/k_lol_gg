import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotNotFoundResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:rso:callback", { revision: "required" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["state", "code"]) || typeof body.state !== "string" || typeof body.code !== "string") return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.completeRso({ context: prepared.value.context, playerId: owner.playerId, expectedRevision: prepared.value.expectedRevision, publicState: body.state, authorizationCode: body.code }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
