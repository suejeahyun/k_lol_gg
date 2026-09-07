import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import { exactObject, prepareRiotMutation, requireRiotApiSession, riotErrorResponse, riotInvalidInputResponse, riotMutationResponse, riotUnavailableResponse } from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:admin:sync", { revision: "none" }); if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  const single = exactObject(body, ["linkId"]) && typeof body.linkId === "string";
  const all = exactObject(body, ["all"]) && body.all === true;
  if (!single && !all) return riotInvalidInputResponse(prepared.value.traceId);
  const runtime = getRuntimeRiot(); if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try { return riotMutationResponse(await runtime.service.requestSync({ context: prepared.value.context, mode: all ? "ALL" : "SINGLE", linkIds: single ? [body.linkId as string] : undefined }), prepared.value.traceId); }
  catch (error) { return riotErrorResponse(error, prepared.value.traceId); }
}
