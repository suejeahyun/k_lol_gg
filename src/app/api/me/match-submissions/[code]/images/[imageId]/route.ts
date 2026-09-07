import { readValidatedTraceId } from "@/platform/http";
import { canonicalSubmissionPublicCode } from "@/modules/matches";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { matchInvalidInputResponse, matchNotFoundResponse, matchPrivateImageResponse, matchServiceErrorResponse, matchServiceUnavailableResponse, requireMatchApiSession } from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string; imageId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchInvalidInputResponse(traceId);
  const { code: rawCode, imageId } = await context.params;
  const code = canonicalSubmissionPublicCode(rawCode);
  if (!code) return matchNotFoundResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const submission = await service.getOwnSubmissionByPublicCode(authorization.session.userId, code);
    if (!submission) return matchNotFoundResponse(traceId);
    const image = await service.getOwnPrivateImage(authorization.session.userId, submission.id, imageId);
    return image ? matchPrivateImageResponse(image, traceId) : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
