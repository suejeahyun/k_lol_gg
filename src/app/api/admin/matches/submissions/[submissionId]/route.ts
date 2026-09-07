import { formatRevisionEtag, readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchNotFoundResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ submissionId: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchInvalidInputResponse(traceId);
  const { submissionId } = await context.params;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const submission = await service.getAdminSubmission(submissionId);
    return submission
      ? matchReadResponse(
          { submission },
          200,
          traceId,
          { ETag: formatRevisionEtag(submission.revision) },
        )
      : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}
