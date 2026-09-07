import { disciplineErrorResponse, disciplineReadResponse, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireDisciplineApiSession("USER");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService();
  try { return service ? disciplineReadResponse({ tasks: await service.adapter.listOwnerTasks(auth.session.userId) }, traceId) : disciplineErrorResponse(new Error("UNAVAILABLE"), traceId); }
  catch (error) { return disciplineErrorResponse(error, traceId); }
}
