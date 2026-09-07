import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { operationsActor, operationsErrorResponse, operationsUnavailableResponse, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { readValidatedTraceId } from "@/platform/http";

const kinds = new Set(["players", "matches", "mmr", "rankings"]);
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const { kind } = await context.params;
  if (!kinds.has(kind) || new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_BACKUP_KIND"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const csv = await repository.buildBackup(kind as "players" | "matches" | "mmr" | "rankings", operationsActor(authorization.session));
    return new Response(csv, { status: 200, headers: {
      "Cache-Control": "no-store", "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="klol-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      ...(traceId ? { "X-Trace-Id": traceId } : {}),
    } });
  } catch (error) { return operationsErrorResponse(error, traceId); }
}
