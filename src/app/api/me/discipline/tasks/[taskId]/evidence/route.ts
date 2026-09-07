import { readExactUploadBody } from "@/modules/matches/infrastructure/match-http";
import {
  accountPrivateAssetActor,
  disciplineErrorResponse,
  disciplineMutationResponse,
  makeDisciplineCommand,
  prepareDisciplineUpload,
  requireDisciplineApiSession,
} from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("USER");
  if (!auth.ok) return auth.response;
  const prepared = prepareDisciplineUpload(request);
  if (!prepared.ok) return prepared.response;
  const body = await readExactUploadBody(request, prepared.byteSize);
  if (!body.ok) return disciplineErrorResponse(new Error("INVALID_UPLOAD_BODY"), prepared.traceId);
  const service = getRuntimeDisciplineService();
  if (!service) return disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId);
  const taskId = (await context.params).taskId;
  try {
    const task = await service.adapter.getOwnerTask(auth.session.userId, taskId);
    if (!task) throw new Error("DISCIPLINE_TASK_NOT_FOUND");
    if (task.revision !== prepared.expectedRevision) throw new Error("STALE_TASK_REVISION");
    const actor = accountPrivateAssetActor(auth.session);
    const staged = await service.assets.stage({ actor, resourceType: "DISCIPLINE_TASK", resourceId: taskId, purpose: "DISCIPLINE_RESOLUTION", bytes: body.bytes, declaredContentType: prepared.contentType, declaredSha256Hex: prepared.sha256Hex, originalFileName: prepared.originalFileName });
    const ready = await service.assets.finalize(actor, staged.assetId);
    const result = await service.handle(makeDisciplineCommand({ type: "SUBMIT_EVIDENCE", taskId, session: auth.session, requestKey: prepared.requestKey, expectedRevision: prepared.expectedRevision, bodyDigestHex: prepared.sha256Hex, payload: { privateAssetId: ready.assetId } }));
    return disciplineMutationResponse(result, prepared.traceId);
  } catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
