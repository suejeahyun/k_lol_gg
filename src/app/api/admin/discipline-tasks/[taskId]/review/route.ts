import { disciplineErrorResponse, disciplineMutationResponse, makeDisciplineCommand, prepareDisciplineJsonMutation, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { parseDisciplineReview } from "@/modules/discipline/infrastructure/discipline-input";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ taskId: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("SUPER_ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareDisciplineJsonMutation(request); if (!prepared.ok) return prepared.response;
  const input = parseDisciplineReview(prepared.body); if (!input) return disciplineErrorResponse(new Error("INVALID_REVIEW_DISCIPLINE"), prepared.traceId);
  const service = getRuntimeDisciplineService();
  try { const result = await service?.handle(makeDisciplineCommand({ type: "REVIEW_EVIDENCE", taskId: (await context.params).taskId, session: auth.session, requestKey: prepared.requestKey, expectedRevision: prepared.expectedRevision, bodyDigestHex: prepared.bodyDigestHex, payload: input })); return result ? disciplineMutationResponse(result, prepared.traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId); }
  catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
