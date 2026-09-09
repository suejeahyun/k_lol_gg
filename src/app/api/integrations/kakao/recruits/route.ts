import { randomUUID } from "node:crypto";

import type { RecruitingCommand } from "@/modules/recruiting/application/commands";
import { RecruitingApplicationError } from "@/modules/recruiting/application/command-handler";
import { getRuntimeRecruitingService } from "@/modules/recruiting/infrastructure/runtime-recruiting";
import { parseRecruitingCommandBody } from "@/modules/recruiting/infrastructure/recruiting-input";
import {
  PUBLIC_KAKAO_ROOM_COMMAND,
  recordKakaoWebhookRejection,
  verifyKakaoHttpRequest,
} from "@/modules/recruiting/infrastructure/kakao-http-request";
import {
  makeRecruitingCommand,
  recruitingErrorResponse,
  recruitingMutationResponse,
  recruitingUnavailableResponse,
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
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { kakaoWebhookFailureResponse } from "@/modules/recruiting/kakao-access/http";
import { KakaoRoomRegistryError } from "@/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import { legacyKakaoInstallationId } from "@/modules/recruiting/infrastructure/kakao-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_BODY_BYTES = 256 * 1_024;
const BOT_TYPES: ReadonlySet<RecruitingCommand["type"]> = new Set([
  "CREATE_PARTY", "SYNC_PARTY", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY",
  "CREATE_SCRIM", "SYNC_SCRIM", "JOIN_SCRIM", "REOPEN_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM", "CANCEL_SCRIM",
]);

type RecruitRoutePerformance = {
  authMs: number;
  parseMs: number;
  resolveMs: number;
  serviceMs: number;
  source: "COMPAT_V1" | "RAW_V2" | "UNKNOWN";
  command: RecruitingCommand["type"] | "UNKNOWN";
};

function timedResponse(response: Response, performance: RecruitRoutePerformance, totalMs: number) {
  const headers = new Headers(response.headers);
  const rounded = (value: number) => Math.max(0, Math.round(value * 10) / 10);
  headers.set("Server-Timing", [
    `auth;dur=${rounded(performance.authMs)}`,
    `parse;dur=${rounded(performance.parseMs)}`,
    `resolve;dur=${rounded(performance.resolveMs)}`,
    `service;dur=${rounded(performance.serviceMs)}`,
    `total;dur=${rounded(totalMs)}`,
  ].join(", "));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const metrics: RecruitRoutePerformance = { authMs: 0, parseMs: 0, resolveMs: 0, serviceMs: 0, source: "UNKNOWN", command: "UNKNOWN" };
  let status = 500;
  try {
    const response = await handlePost(request, metrics);
    status = response.status;
    return timedResponse(response, metrics, performance.now() - startedAt);
  } finally {
    // Structured values are intentionally limited to route/stage timings and
    // command categories; never log room, sender, installation, body, or secret.
    console.info("KAKAO_RECRUIT_PERF", JSON.stringify({
      route: "kakao/recruits",
      source: metrics.source,
      command: metrics.command,
      status,
      authMs: Math.round(metrics.authMs),
      parseMs: Math.round(metrics.parseMs),
      resolveMs: Math.round(metrics.resolveMs),
      serviceMs: Math.round(metrics.serviceMs),
      totalMs: Math.round(performance.now() - startedAt),
    }));
  }
}

async function handlePost(request: Request, metrics: RecruitRoutePerformance) {
  const traceId = readValidatedTraceId(request.headers);
  // V1 party forms are collaboratively edited by human members of an approved room.
  // The raw-body HMAC, approved-room check, nonce claim and bot-self rejection remain mandatory.
  const authStartedAt = performance.now();
  const verification = await verifyKakaoHttpRequest(request, new Date(), MAXIMUM_BODY_BYTES, PUBLIC_KAKAO_ROOM_COMMAND);
  metrics.authMs = performance.now() - authStartedAt;
  if (!verification.ok) {
    recordKakaoWebhookRejection(verification.code, { route: new URL(request.url).pathname, traceId, request });
    return kakaoWebhookFailureResponse(verification.code, traceId);
  }
  const { rawBody, intent } = verification.value;
  if (!await isRuntimeKakaoFeatureEnabled("recruitingEnabled")) return recruitingUnavailableResponse(traceId);

  const parseStartedAt = performance.now();
  const parsedJson = await readJsonBody(new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: rawBody,
  }), { maximumBytes: MAXIMUM_BODY_BYTES });
  if (!parsedJson.ok) return problemResponse(problemForJsonBodyError(parsedJson.error), { traceId });
  const parsed = parseRecruitingCommandBody(parsedJson.value, BOT_TYPES, undefined, true);
  metrics.parseMs = performance.now() - parseStartedAt;
  if (!parsed) return recruitingErrorResponse(new RecruitingApplicationError("INVALID_COMMAND", "Invalid Kakao recruiting command."), traceId);
  metrics.source = parsed.source === "RAW_V2" ? "RAW_V2" : "COMPAT_V1";
  metrics.command = parsed.type;
  if (parsed.source === "RAW_V2" && (parsed.compatTarget || parsed.compatCreate)) {
    return recruitingErrorResponse(new RecruitingApplicationError("INVALID_COMMAND", "Raw V2 cannot use compatibility lookup fields."), traceId);
  }
  if (parsed.source === "RAW_V2") {
    const { getRuntimeKakaoRoomRegistry } = await import("@/modules/recruiting/kakao-access/runtime");
    const registry = getRuntimeKakaoRoomRegistry();
    try {
      if (!registry) throw new KakaoRoomRegistryError("UNAVAILABLE");
      await registry.authorize({ installationPublicId: intent.installationId ?? legacyKakaoInstallationId(intent.keyId), senderFingerprint: intent.senderId, requiredRole: "ADMIN", keyId: intent.keyId, botVersion: intent.botVersion });
    } catch {
      recordKakaoWebhookRejection("ROLE_FORBIDDEN", { route: new URL(request.url).pathname, traceId, request });
      return kakaoWebhookFailureResponse("ROLE_FORBIDDEN", traceId);
    }
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return problemResponse(problemForIfMatchRevisionError(revision.error), { traceId });

  const service = getRuntimeRecruitingService();
  if (!service) return recruitingUnavailableResponse(traceId);
  try {
    let commandType: RecruitingCommand["type"] = parsed.type;
    let payload: RecruitingCommand["payload"] = parsed.payload;
    let aggregateId = parsed.aggregateId;
    let expectedRevision = revision.revision;
    if (parsed.compatCreate && !(
      parsed.source === "COMPAT_V1" && parsed.type === "SYNC_PARTY" && parsed.compatTarget?.kind === "PARTY" && parsed.aggregateId
    )) throw new RecruitingApplicationError("INVALID_COMMAND", "Invalid V1 party upsert fallback.");
    if (parsed.compatTarget) {
      const expectedKind = parsed.type.includes("SCRIM") ? "SCRIM" : "PARTY";
      if (parsed.source !== "COMPAT_V1" || parsed.type.startsWith("CREATE_") || parsed.compatTarget.kind !== expectedKind) {
        throw new RecruitingApplicationError("INVALID_COMMAND", "Invalid V1 compatibility target.");
      }
      const resolveStartedAt = performance.now();
      const target = await service.resolveCompatTarget({ ...parsed.compatTarget, sourceRoomId: intent.roomId });
      metrics.resolveMs += performance.now() - resolveStartedAt;
      if (target) {
        aggregateId = target.id;
        expectedRevision = target.revision;
      } else if (parsed.compatCreate && parsed.type === "SYNC_PARTY") {
        const syncPayload = parsed.payload as Extract<RecruitingCommand, { type: "SYNC_PARTY" }>["payload"];
        commandType = "CREATE_PARTY";
        expectedRevision = 0;
        payload = {
          recruitDate: parsed.compatTarget.recruitDate,
          resetSequence: null,
          recruitNumber: parsed.compatTarget.recruitNumber,
          partyType: parsed.compatCreate.partyType,
          title: parsed.compatCreate.title,
          maximumMembers: parsed.compatCreate.maximumMembers,
          members: syncPayload.members,
          startTimeText: syncPayload.startTimeText,
          gameInfo: syncPayload.gameInfo,
          scheduledStartAt: syncPayload.scheduledStartAt ?? null,
          protectedUntil: null,
        } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>["payload"];
      } else {
        throw new RecruitingApplicationError("NOT_FOUND", "The V1 recruiting target was not found in this room.");
      }
    }
    if (!aggregateId) throw new RecruitingApplicationError("INVALID_COMMAND", "A recruiting aggregate ID is required.");
    const createPartyPayload = commandType === "CREATE_PARTY"
      ? payload as Extract<RecruitingCommand, { type: "CREATE_PARTY" }>["payload"]
      : null;
    const autoNumberedParty = createPartyPayload !== null &&
      createPartyPayload.resetSequence === null &&
      parsed.source === "COMPAT_V1";
    if (createPartyPayload &&
      (createPartyPayload.resetSequence === null || createPartyPayload.recruitNumber === null) && !autoNumberedParty) {
      throw new RecruitingApplicationError("INVALID_COMMAND", "Invalid automatic party numbering request.");
    }
    const actor = {
      kind: "BOT" as const,
      principalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      authorizationIntent: intent,
      commandSource: parsed.source === "RAW_V2" ? "RAW_V2" as const : "COMPAT_V1" as const,
    };
    const command = makeRecruitingCommand({
      type: commandType,
      aggregateId,
      actor,
      requestId: randomUUID(),
      requestKey: idempotency.key.normalized,
      expectedRevision,
      bodyDigestHex: intent.bodyDigestHex,
      issuedAt: new Date(intent.timestampSeconds * 1_000),
      payload,
    });
    const serviceStartedAt = performance.now();
    const result = await service.handle(command);
    metrics.serviceMs = performance.now() - serviceStartedAt;
    return recruitingMutationResponse(result, traceId);
  } catch (error) {
    return recruitingErrorResponse(error, traceId);
  }
}
