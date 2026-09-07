import { adminPrivateAssetActor, disciplineErrorResponse, disciplinePrivateImageResponse, requireDisciplineApiSession } from "@/modules/discipline/infrastructure/discipline-http";
import { getRuntimeDisciplineService } from "@/modules/discipline/infrastructure/runtime-discipline";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ assetId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await requireDisciplineApiSession("ADMIN"); if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return disciplineErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeDisciplineService(); if (!service) return disciplineErrorResponse(new Error("UNAVAILABLE"), traceId);
  try { return disciplinePrivateImageResponse(await service.assets.readPrivateBytes(adminPrivateAssetActor(auth.session), (await context.params).assetId), traceId); }
  catch (error) { return disciplineErrorResponse(error, traceId); }
}
