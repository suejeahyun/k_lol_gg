import { readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { matchInvalidInputResponse, matchNotFoundResponse, matchPrivateImageResponse, matchServiceErrorResponse, matchServiceUnavailableResponse, requireMatchApiSession } from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ submissionId: string; imageId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchInvalidInputResponse(traceId);
  const { submissionId, imageId } = await context.params;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const image = await service.getAdminPrivateImage(submissionId, imageId);
    return image ? matchPrivateImageResponse(image, traceId) : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
