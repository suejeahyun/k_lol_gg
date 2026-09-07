import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { getMatchImageWorkGate } from "@/modules/matches/infrastructure/match-image-work-gate";
import { matchMutationResponse, matchServiceErrorResponse, matchServiceUnavailableResponse, prepareMatchJsonMutation, requireMatchApiSession } from "@/modules/matches/infrastructure/match-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ submissionId: string; imageId: string }> };

export async function POST(request: Request, context: Context) {
  const authorization = await requireMatchApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const { submissionId, imageId } = await context.params;
  const prepared = await prepareMatchJsonMutation(request, `admin:match-submissions:${submissionId}:images:${imageId}:ocr`, authorization.session, "ADMIN", 1024);
  if (!prepared.ok) return prepared.response;
  const service = getRuntimeMatchService();
  if (!service) return matchServiceUnavailableResponse(prepared.traceId);
  try {
    const reservation = await service.prepareSubmissionImageOcr(
      prepared.context,
      submissionId,
      imageId,
      prepared.expectedRevision,
      prepared.body,
    );
    if (reservation.kind === "REPLAY") {
      return matchMutationResponse(reservation.result, prepared.traceId);
    }
    let releaseWorkSlot: (() => void) | null = null;
    try {
      releaseWorkSlot = await getMatchImageWorkGate().acquire();
      return matchMutationResponse(
        await service.finalizeSubmissionImageOcr(
          prepared.context,
          reservation,
          submissionId,
          imageId,
          prepared.expectedRevision,
          prepared.body,
        ),
        prepared.traceId,
      );
    } catch (error) {
      await service.failSubmissionImageOcrReservation(
        prepared.context,
        reservation.reservationId,
        submissionId,
        imageId,
        prepared.expectedRevision,
        prepared.body,
        releaseWorkSlot ? "OCR_FINALIZE_FAILED" : "OCR_WORK_GATE_UNAVAILABLE",
      ).catch(() => undefined);
      throw error;
    } finally {
      releaseWorkSlot?.();
    }
  } catch (error) {
    return matchServiceErrorResponse(error, prepared.traceId);
  }
}
