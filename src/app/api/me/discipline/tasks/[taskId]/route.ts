import { disciplineErrorResponse, disciplineReadResponse, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ taskId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("USER");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService();
  try {
    const task = service ? await service.adapter.getOwnerTask(auth.session.userId, (await context.params).taskId) : null;
    return task ? disciplineReadResponse(task, traceId) : disciplineErrorResponse(new Error("DISCIPLINE_TASK_NOT_FOUND"), traceId);
  } catch (error) { return disciplineErrorResponse(error, traceId); }
}
