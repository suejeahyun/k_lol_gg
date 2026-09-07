import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotNotFoundResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("USER"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:sync:single", { revision: "none" }); if (!prepared.ok) return prepared.response;
  if (!exactObject(prepared.value.body, [])) return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const owner = await runtime.query.getOwnerStatus(auth.session.userId); if (!owner?.link) return riotNotFoundResponse(prepared.value.traceId);
    return riotMutationResponse(await runtime.service.requestSync({ context: prepared.value.context, mode: "SINGLE", linkIds: [owner.link.id] }), prepared.value.traceId);
  } catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
