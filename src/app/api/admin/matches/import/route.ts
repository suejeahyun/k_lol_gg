import { canonicalUuid } from "@/modules/matches";
import { getMatchImageWorkGate } from "@/modules/matches/infrastructure/match-image-work-gate";
import {
  matchMutationResponse,
  matchNotFoundResponse,
  matchServiceErrorResponse,
  matchServiceUnavailableResponse,
  prepareMatchJsonMutation,
  prepareMatchUploadHeaders,
  readExactUploadBody,
  requireMatchApiSession,
  uploadBodyProblem,
} from "@/modules/matches/infrastructure/match-http";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareMatchJsonMutation(
    request,
    "admin:matches:import:create",
    authorization.session,
    "ADMIN",
    8 * 1_024,
  );
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    return matchMutationResponse(
      await service.createAdminImport(prepared.context, prepared.body),
      prepared.traceId,
    );
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}

export async function PUT(request: Request) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const rawSubmissionId = request.headers.get("x-match-import-id");
  const submissionId = rawSubmissionId ? canonicalUuid(rawSubmissionId) : null;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse();
  try {
    if (!submissionId) return matchNotFoundResponse();
    const submission = await service.getAdminSubmission(submissionId);
    if (!submission || submission.source !== "ADMIN") return matchNotFoundResponse();
    const preparedHeaders = prepareMatchUploadHeaders(
      request,
      `admin:match-imports:${submissionId}:images:1`,
      authorization.session,
      submissionId,
      "ADMIN",
    );
    if (!preparedHeaders.ok) return preparedHeaders.response;
    const prepared = await service.prepareAdminImportImageUpload(
      preparedHeaders.context,
      preparedHeaders.declaration,
    );
    if (prepared.kind === "REPLAY") {
      if (request.body && !request.body.locked) {
        await request.body.cancel("admin import upload replay").catch(() => undefined);
      }
      return matchMutationResponse(prepared.result, preparedHeaders.traceId);
    }
    const body = await readExactUploadBody(request, preparedHeaders.declaration.byteSize);
    if (!body.ok) {
      await service.cancelSubmissionImageUpload(
        preparedHeaders.context,
        prepared.reservationId,
        preparedHeaders.declaration,
      ).catch(() => undefined);
      return uploadBodyProblem(body.error, preparedHeaders.traceId);
    }
    let releaseWorkSlot: (() => void) | null = null;
    try {
      releaseWorkSlot = await getMatchImageWorkGate().acquire();
      return matchMutationResponse(
        await service.finalizeAdminImportImageUpload(
          preparedHeaders.context,
          prepared.reservationId,
          preparedHeaders.declaration,
          body.bytes,
        ),
        preparedHeaders.traceId,
      );
    } catch (error) {
      if (!releaseWorkSlot) {
        await service.cancelSubmissionImageUpload(
          preparedHeaders.context,
          prepared.reservationId,
          preparedHeaders.declaration,
        ).catch(() => undefined);
      }
      throw error;
    } finally {
      releaseWorkSlot?.();
    }
  } catch (error) {
    return matchServiceErrorResponse(error);
  }
}
