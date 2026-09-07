import { disciplineErrorResponse, disciplineMutationResponse, disciplineReadResponse, makeDisciplineAdminEnvelope, prepareDisciplineJsonMutation, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { parseCancelDisciplineRecord, parseUpdateDisciplineRecord } from "@/modules/discipline/infrastructure/discipline-input";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ recordId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService();
  try { const record = service ? await service.adapter.getAdminRecord((await context.params).recordId) : null; return record ? disciplineReadResponse(record, traceId) : disciplineErrorResponse(new Error("DISCIPLINE_RECORD_NOT_FOUND"), traceId); }
  catch (error) { return disciplineErrorResponse(error, traceId); }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareDisciplineJsonMutation(request); if (!prepared.ok) return prepared.response;
  const input = parseUpdateDisciplineRecord(prepared.body); if (!input) return disciplineErrorResponse(new Error("INVALID_UPDATE_DISCIPLINE"), prepared.traceId);
  const service = getRuntimeDisciplineService();
  try { return service ? disciplineMutationResponse(await service.adapter.updateRecord(makeDisciplineAdminEnvelope(auth.session, prepared, "admin:discipline:record:update"), (await context.params).recordId, prepared.expectedRevision, input, new Date()), prepared.traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId); }
  catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
export async function DELETE(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const prepared = await prepareDisciplineJsonMutation(request); if (!prepared.ok) return prepared.response;
  const input = parseCancelDisciplineRecord(prepared.body); if (!input) return disciplineErrorResponse(new Error("INVALID_CANCEL_DISCIPLINE"), prepared.traceId);
  const service = getRuntimeDisciplineService();
  try { return service ? disciplineMutationResponse(await service.adapter.cancelRecord(makeDisciplineAdminEnvelope(auth.session, prepared, "admin:discipline:record:cancel"), (await context.params).recordId, prepared.expectedRevision, input.reason, new Date()), prepared.traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId); }
  catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
