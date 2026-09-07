import { canonicalSubmissionPublicCode } from "@/modules/matches";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { getMatchImageWorkGate } from "@/modules/matches/infrastructure/match-image-work-gate";
import {
  matchMutationResponse,
  matchNotFoundResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchUploadHeaders,
  readExactUploadBody,
  requireMatchApiSession,
  uploadBodyProblem,
} from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ACCOUNT");
  if (!authorization.ok) return authorization.response;
  const { code: rawCode } = await context.params;
  const code = canonicalSubmissionPublicCode(rawCode);
  if (!code) return matchNotFoundResponse();
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse();
  try {
    const submission = await service.getOwnSubmissionByPublicCode(authorization.session.userId, code);
    if (!submission) return matchNotFoundResponse();
    const preparedHeaders = prepareMatchUploadHeaders(
      request,
      `me:match-submissions:${code}:images`,
      authorization.session,
      submission.id,
    );
    if (!preparedHeaders.ok) return preparedHeaders.response;
    const prepared = await service.prepareSubmissionImageUpload(
      preparedHeaders.context,
      preparedHeaders.declaration,
    );
    if (prepared.kind === "REPLAY") {
      if (request.body && !request.body.locked) {
        await request.body.cancel("idempotent upload replay").catch(() => undefined);
      }
      return matchMutationResponse(prepared.result, preparedHeaders.traceId);
    }
    const body = await readExactUploadBody(request, preparedHeaders.declaration.byteSize);
    if (!body.ok) {
      await service
        .cancelSubmissionImageUpload(
          preparedHeaders.context,
          prepared.reservationId,
          preparedHeaders.declaration,
        )
        .catch(() => undefined);
      return uploadBodyProblem(body.error, preparedHeaders.traceId);
    }
    let releaseWorkSlot: (() => void) | null = null;
    try {
      releaseWorkSlot = await getMatchImageWorkGate().acquire();
      return matchMutationResponse(
        await service.finalizeSubmissionImageUpload(
          preparedHeaders.context,
          prepared.reservationId,
          preparedHeaders.declaration,
          body.bytes,
        ),
        preparedHeaders.traceId,
      );
    } catch (error) {
      if (!releaseWorkSlot) {
        await service
          .cancelSubmissionImageUpload(
            preparedHeaders.context,
            prepared.reservationId,
            preparedHeaders.declaration,
          )
          .catch(() => undefined);
      }
      throw error;
    } finally {
      releaseWorkSlot?.();
    }
  } catch (error) {
    return matchServiceErrorResponse(error);
  }
}
