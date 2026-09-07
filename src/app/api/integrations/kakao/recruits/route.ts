import { randomUUID } from "node:crypto";

import type { RecruitingCommand } from "@/modules/recruiting/application/commands";
import { verifyKakaoWebhook, type KakaoWebhookSecret } from "@/modules/recruiting/infrastructure/kakao-signature";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { parseRecruitingCommandBody } from "@/modules/recruiting/infrastructure/recruiting-input";
import {
  makeRecruitingCommand,
  recruitingErrorResponse,
  recruitingMutationResponse,
  recruitingUnavailableResponse,
  recruitingWebhookForbiddenResponse,
} from "@/modules/recruiting/infrastructure/recruiting-http";
import {
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_BODY_BYTES = 256 * 1_024;
const BOT_TYPES: ReadonlySet<RecruitingCommand["type"]> = new Set([
  "CREATE_PARTY", "SYNC_PARTY", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY",
  "CREATE_SCRIM", "JOIN_SCRIM", "REOPEN_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM", "CANCEL_SCRIM",
]);

function splitIdentifiers(value: string | undefined) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

function webhookSecrets(): readonly KakaoWebhookSecret[] | null {
  const current = process.env.KAKAO_WEBHOOK_SECRET_CURRENT;
  if (!current) return null;
  const secrets: KakaoWebhookSecret[] = [{
    keyId: process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT ?? "current",
    secret: new TextEncoder().encode(current),
  }];
  const previous = process.env.KAKAO_WEBHOOK_SECRET_PREVIOUS;
  if (previous) secrets.push({
    keyId: process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS ?? "previous",
    secret: new TextEncoder().encode(previous),
  });
  return secrets;
}

async function readBoundedRawBody(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^[1-9][0-9]{0,6}$/u.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) return null;
  if (!request.body || request.bodyUsed) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > MAXIMUM_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(item.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (length < 2 || (declared && Number(declared) !== length)) return null;
  const rawBody = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return rawBody;
}

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return recruitingWebhookForbiddenResponse(traceId);
  const timestampText = request.headers.get("x-klol-timestamp");
  const timestampSeconds = timestampText && /^(?:0|[1-9][0-9]{0,12})$/u.test(timestampText) ? Number(timestampText) : -1;
  const nonce = request.headers.get("x-klol-nonce") ?? "";
  const roomId = request.headers.get("x-klol-room") ?? "";
  const senderId = request.headers.get("x-klol-sender") ?? "";
  const selfHeader = request.headers.get("x-klol-bot-self");
  const signature = request.headers.get("x-klol-signature") ?? "";
  const secrets = webhookSecrets();
  const rawBody = await readBoundedRawBody(request);
  if (!secrets || !rawBody || (selfHeader !== "0" && selfHeader !== "1")) return recruitingWebhookForbiddenResponse(traceId);
  const verification = verifyKakaoWebhook({
    request: { timestampSeconds, nonce, roomId, senderId, botSelf: selfHeader === "1", signature, rawBody },
    now: new Date(),
    secrets,
    allowedRoomIds: splitIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS),
    allowedSenderIds: splitIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS),
    botSenderId: process.env.KAKAO_WEBHOOK_BOT_SENDER_ID ?? "",
    nonceAlreadyUsed: false,
  });
  if (!verification.ok) return recruitingWebhookForbiddenResponse(traceId);

  const parsedJson = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: rawBody,
  }), { maximumBytes: MAXIMUM_BODY_BYTES });
  if (!parsedJson.ok) return problemResponse(problemForJsonBodyError(parsedJson.error), { traceId });
  const parsed = parseRecruitingCommandBody(parsedJson.value, BOT_TYPES);
  if (!parsed || !parsed.aggregateId) return recruitingErrorResponse(new Error("INVALID_WEBHOOK_COMMAND"), traceId);
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return problemResponse(problemForIfMatchRevisionError(revision.error), { traceId });

  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(traceId);
  try {
    const actor = {
      kind: "BOT" as const,
      principalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      authorizationIntent: verification.intent,
    };
    const command = makeRecruitingCommand({
      type: parsed.type,
      aggregateId: parsed.aggregateId,
      actor,
      requestId: randomUUID(),
      requestKey: idempotency.key.normalized,
      expectedRevision: revision.revision,
      bodyDigestHex: verification.intent.bodyDigestHex,
      issuedAt: new Date(verification.intent.timestampSeconds * 1_000),
      payload: parsed.payload,
    });
    return recruitingMutationResponse(await service.handle(command), traceId);
  } catch (error) {
    return recruitingErrorResponse(error, traceId);
  }
}
