import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { parseRecruitingCommandBody } from "@/modules/recruiting/infrastructure/recruiting-input";
import {
  adminActor,
  makeRecruitingCommand,
  prepareRecruitingJsonMutation,
  recruitingErrorResponse,
  recruitingMutationResponse,
  recruitingUnavailableResponse,
  requireRecruitingApiSession,
} from "@/modules/recruiting/infrastructure/recruiting-http";

export const dynamic = "force-dynamic";

const ADMIN_MUTATION_TYPES = new Set([
  "SYNC_PARTY", "FINISH_PARTY", "CANCEL_PARTY", "RESET_PARTY",
  "JOIN_SCRIM", "REOPEN_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM", "CANCEL_SCRIM",
] as const);

export async function PATCH(request: Request, context: { params: Promise<{ recruitId: string }> }) {
  const authorization = await requireRecruitingApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareRecruitingJsonMutation(request);
  if (!prepared.ok) return prepared.response;
  const { recruitId } = await context.params;
  const parsed = parseRecruitingCommandBody(prepared.body, ADMIN_MUTATION_TYPES, recruitId);
  if (!parsed) return recruitingErrorResponse(new Error("INVALID_ADMIN_RECRUIT"), prepared.traceId);
  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(prepared.traceId);
  try {
    const command = makeRecruitingCommand({
      type: parsed.type,
      aggregateId: recruitId,
      actor: adminActor(authorization.session),
      requestKey: prepared.requestKey,
      expectedRevision: prepared.expectedRevision,
      bodyDigestHex: prepared.bodyDigestHex,
      payload: parsed.payload,
    });
    return recruitingMutationResponse(await service.handle(command), prepared.traceId);
  } catch (error) {
    return recruitingErrorResponse(error, prepared.traceId);
  }
}
