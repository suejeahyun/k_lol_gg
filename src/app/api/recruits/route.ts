import { randomUUID } from "node:crypto";

import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { parseRecruitingCommandBody } from "@/modules/recruiting/infrastructure/recruiting-input";
import {
  accountActor,
  makeRecruitingCommand,
  prepareRecruitingJsonMutation,
  recruitingErrorResponse,
  recruitingMutationResponse,
  recruitingReadResponse,
  recruitingUnavailableResponse,
  requireRecruitingApiSession,
} from "@/modules/recruiting/infrastructure/recruiting-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

const ACCOUNT_CREATE_TYPES = new Set(["CREATE_PARTY", "CREATE_SCRIM"] as const);

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return recruitingErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(traceId);
  try {
    return recruitingReadResponse(await service.listPublicFeed(), traceId);
  } catch (error) {
    return recruitingErrorResponse(error, traceId);
  }
}
export async function POST(request: Request) {
  const authorization = await requireRecruitingApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareRecruitingJsonMutation(request);
  if (!prepared.ok) return prepared.response;
  const parsed = parseRecruitingCommandBody(prepared.body, ACCOUNT_CREATE_TYPES);
  if (!parsed || parsed.aggregateId !== null || prepared.expectedRevision !== 0) {
    return recruitingErrorResponse(new Error("INVALID_CREATE_RECRUIT"), prepared.traceId);
  }
  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(prepared.traceId);
  try {
    const command = makeRecruitingCommand({
      type: parsed.type,
      aggregateId: randomUUID(),
      actor: accountActor(authorization.session),
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
