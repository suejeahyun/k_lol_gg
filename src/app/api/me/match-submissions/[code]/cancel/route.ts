import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import {
  matchMutationResponse,
  matchNotFoundResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchJsonMutation,
  requireMatchApiSession,
} from "@/modules/matches/infrastructure/match-http";
import { requireSiteFeature } from "@/modules/operations/infrastructure/site-feature-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const featureFailure = await requireSiteFeature(request, "matchSubmissions");
  if (featureFailure) return featureFailure;
  const { code } = await context.params;
  const prepared = await prepareMatchJsonMutation(
    request,
    `me:match-submissions:${code}:cancel`,
    authorization.session,
    "ACCOUNT",
    1_024,
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    const submission = await service.getOwnSubmissionByPublicCode(
      authorization.session.userId,
      code,
    );
    if (!submission) return matchNotFoundResponse(prepared.traceId);
    return matchMutationResponse(
      await service.cancelSubmission(
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
