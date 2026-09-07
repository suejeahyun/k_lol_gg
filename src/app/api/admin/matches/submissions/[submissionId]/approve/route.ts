import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { matchMutationResponse, matchServiceErrorResponse, matchServiceUnavailableResponse, prepareMatchJsonMutation, requireMatchApiSession } from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ submissionId: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const { submissionId } = await context.params;
  const prepared = await prepareMatchJsonMutation(request, `admin:match-submissions:${submissionId}:approve`, authorization.session, "ADMIN", 1024);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    return matchMutationResponse(await service.approveSubmission(prepared.context, submissionId, prepared.expectedRevision, prepared.body), prepared.traceId);
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}
