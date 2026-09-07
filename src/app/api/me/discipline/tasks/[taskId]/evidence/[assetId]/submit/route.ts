import { disciplineErrorResponse, disciplineMutationResponse, makeDisciplineCommand, prepareDisciplineJsonMutation, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ taskId: string; assetId: string }> };
export async function POST(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDisciplineJsonMutation(request, 1_024);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeDisciplineService();
  if (!service) return disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId);
  const { taskId, assetId } = await context.params;
  try {
    const command = makeDisciplineCommand({ type: "SUBMIT_EVIDENCE", taskId, session: auth.session, requestKey: prepared.requestKey, expectedRevision: prepared.expectedRevision, bodyDigestHex: prepared.bodyDigestHex, payload: { privateAssetId: assetId } });
    return disciplineMutationResponse(await service.handle(command), prepared.traceId);
  } catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
