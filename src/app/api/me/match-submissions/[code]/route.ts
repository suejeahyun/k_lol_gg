import { formatRevisionEtag, readValidatedTraceId } from "@/platform/http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchMutationResponse,
  matchNotFoundResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchJsonMutation,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size !== 0) return matchInvalidInputResponse(traceId);
  const { code } = await context.params;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    const submission = await service.getOwnSubmissionByPublicCode(authorization.session.userId, code);
    return submission
      ? matchReadResponse({ submission }, 200, traceId, { ETag: formatRevisionEtag(submission.revision) })
      : matchNotFoundResponse(traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}

export async function PATCH(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const { code } = await context.params;
  const prepared = await prepareMatchJsonMutation(
    request,
    `me:match-submissions:${code}:update`,
    authorization.session,
    "ACCOUNT",
    16 * 1024,
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    const submission = await service.getOwnSubmissionByPublicCode(authorization.session.userId, code);
    if (!submission) return matchNotFoundResponse(prepared.traceId);
    return matchMutationResponse(
      await service.updateSubmission(
        prepared.context,
        submission.id,
        prepared.expectedRevision,
        prepared.body,
      ),
      prepared.traceId,
    );
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}
