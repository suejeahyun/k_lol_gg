import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("SUPER_ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:sync:bulk", { revision: "none" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (!exactObject(body, ["linkIds"]) || !Array.isArray(body.linkIds) || body.linkIds.some((id) => typeof id !== "string")) return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try { return riotMutationResponse(await runtime.service.requestSync({ context: prepared.value.context, mode: "BULK", linkIds: body.linkIds as string[] }), prepared.value.traceId); }
  catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
