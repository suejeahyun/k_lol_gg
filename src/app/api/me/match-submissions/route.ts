import { readValidatedTraceId } from "@/platform/http";
import { MatchServiceError } from "@/modules/matches";
import { parseOwnSubmissionQuery } from "@/modules/matches/infrastructure/match-query";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchInvalidInputResponse,
  matchMutationResponse,
  matchReadResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchJsonMutation,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";
import { requireSiteFeature } from "@/modules/operations/infrastructure/site-feature-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = parseOwnSubmissionQuery(request.url);
  if (!query) return matchInvalidInputResponse(traceId);
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(traceId);
  try {
    return matchReadResponse(
      await service.listOwnSubmissions(authorization.session.userId, query),
      200,
      traceId,
    );
  } catch (error) {
    return matchServiceErrorResponse(error, traceId);
  }
}

export async function POST(request: Request) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const featureFailure = await requireSiteFeature(request, "matchSubmissions");
  if (featureFailure) return featureFailure;
  const prepared = await prepareMatchJsonMutation(
    request,
    "me:match-submissions:create",
    authorization.session,
    "ACCOUNT",
    16 * 1024,
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    if (prepared.expectedRevision !== 0) {
      throw new MatchServiceError("PRECONDITION_FAILED", "새 접수는 revision 0에서 생성합니다.");
    }
    return matchMutationResponse(
      await service.createSubmission(prepared.context, prepared.body),
      prepared.traceId,
    );
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}
