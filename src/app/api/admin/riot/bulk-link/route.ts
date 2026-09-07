import { parseAdminRiotQuery } from "@/modules/riot";
import { getRuntimeRiot } from "@/modules/riot/infrastructure/runtime-riot";
import {
  exactObject,
  prepareRiotMutation,
  requireRiotApiSession,
  riotErrorResponse,
  riotInvalidInputResponse,
  riotMutationResponse,
  riotUnavailableResponse,
} from "@/modules/riot/infrastructure/riot-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRiotApiSession("SUPER_ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareRiotMutation(request, auth.session, "riot:admin:bulk-link", { revision: "required" });
  if (!prepared.ok) return prepared.response;
  const body = prepared.value.body;
  if (
    prepared.value.expectedRevision !== 0 ||
    !exactObject(body, ["q", "batchSize", "candidateIds", "remainingBefore"]) ||
    typeof body.q !== "string" ||
    typeof body.batchSize !== "number" ||
    typeof body.remainingBefore !== "number" ||
    !Array.isArray(body.candidateIds) ||
    body.candidateIds.some((id) => typeof id !== "string")
  ) return riotInvalidInputResponse(prepared.value.traceId);

  const queryUrl = new URL("https://v2.invalid/admin/riot");
  queryUrl.searchParams.set("tab", "accounts");
  queryUrl.searchParams.set("action", "bulk-link");
  if (body.q) queryUrl.searchParams.set("q", body.q);
  queryUrl.searchParams.set("batchSize", String(body.batchSize));
  const query = parseAdminRiotQuery(queryUrl.href);
  const candidateIds = body.candidateIds as string[];
  if (!query || candidateIds.length < 1 || candidateIds.length > query.batchSize || new Set(candidateIds).size !== candidateIds.length) {
    return riotInvalidInputResponse(prepared.value.traceId);
  }

  const runtime = getRuntimeRiot();
  if (!runtime) return riotUnavailableResponse(prepared.value.traceId);
  try {
    const result = await runtime.service.connectDirectBulk({
      context: prepared.value.context,
      candidateIds,
      remainingBefore: body.remainingBefore,
    });
    return riotMutationResponse(result, prepared.value.traceId);
  } catch (error) {
    return riotErrorResponse(error, prepared.value.traceId);
  }
}
