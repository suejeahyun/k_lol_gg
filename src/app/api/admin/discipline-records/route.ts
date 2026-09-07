import { disciplineErrorResponse, disciplineMutationResponse, disciplineReadResponse, makeDisciplineAdminEnvelope, prepareDisciplineJsonMutation, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { parseCreateDisciplineRecord } from "@/modules/discipline/infrastructure/discipline-input";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import type { DisciplineTaskStatus } from "@/modules/discipline/domain/evidence-task";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
const statuses = new Set<DisciplineTaskStatus>(["REQUIRED", "AWAITING_UPLOAD", "PENDING_REVIEW", "REJECTED", "APPROVED", "CANCELLED"]);
export async function GET(request: Request) {
  const auth = await requireDisciplineApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? "1");
  const pageSize = Number(query.get("pageSize") ?? "30");
  const tab = query.get("tab") ?? "records";
  const status = query.get("status");
  const activeText = query.get("active");
  if (!["records", "tasks", "reviews"].includes(tab) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (status !== null && !statuses.has(status as DisciplineTaskStatus)) || (activeText !== null && !["true", "false"].includes(activeText))) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService();
  try { return service ? disciplineReadResponse(await service.adapter.listAdmin({ page, pageSize, tab: tab as "records" | "tasks" | "reviews", ...(status ? { status: status as DisciplineTaskStatus } : {}), ...(activeText ? { active: activeText === "true" } : {}) }), traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), traceId); }
  catch (error) { return disciplineErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireDisciplineApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareDisciplineJsonMutation(request);
  if (!prepared.ok) return prepared.response;
  const input = parseCreateDisciplineRecord(prepared.body);
  if (!input || prepared.expectedRevision !== 0) return disciplineErrorResponse(new Error("INVALID_CREATE_DISCIPLINE"), prepared.traceId);
  const service = getRuntimeDisciplineService();
  try { return service ? disciplineMutationResponse(await service.adapter.createRecord(makeDisciplineAdminEnvelope(auth.session, prepared, "admin:discipline:record:create"), input, new Date()), prepared.traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), prepared.traceId); }
  catch (error) { return disciplineErrorResponse(error, prepared.traceId); }
}
