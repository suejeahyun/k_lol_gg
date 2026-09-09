import {
  verifyKakaoWebhook,
  type KakaoWebhookSecret,
  type KakaoWebhookVerification,
  type VerifiedKakaoWebhookIntent,
  type KakaoWebhookCapability,
  legacyKakaoInstallationId,
} from "./kakao-signature";
import { KakaoRoomRegistryError } from "../kakao-access/postgres-kakao-room-registry";

export const MAXIMUM_KAKAO_BODY_BYTES = 256 * 1_024;
export const MAXIMUM_KAKAO_IMAGE_BODY_BYTES = 4_200_000;

export function splitKakaoIdentifiers(value: string | undefined) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

export function mayUseRawKakaoRecruitCommand(
  senderId: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (splitKakaoIdentifiers(environment.KAKAO_WEBHOOK_ALLOWED_SENDERS).has(senderId)) return true;
  return environment.NODE_ENV !== "production" && environment.KAKAO_RAW_RECRUIT_COMMANDS_DEVELOPMENT_ONLY === "true";
}

export function kakaoWebhookSecrets(): readonly KakaoWebhookSecret[] | null {
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

export async function readBoundedKakaoRawBody(request: Request, maximumBytes = MAXIMUM_KAKAO_BODY_BYTES) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 2 || maximumBytes > MAXIMUM_KAKAO_IMAGE_BODY_BYTES) return null;
  const declared = request.headers.get("content-length");
  if (declared && (!/^[1-9][0-9]{0,6}$/u.test(declared) || Number(declared) > maximumBytes)) return null;
  if (!request.body || request.bodyUsed) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.byteLength;
      if (length > maximumBytes) { await reader.cancel(); return null; }
      chunks.push(item.value);
    }
  } catch { return null; } finally { reader.releaseLock(); }
  if (length < 2 || (declared && Number(declared) !== length)) return null;
  const rawBody = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { rawBody.set(chunk, offset); offset += chunk.byteLength; }
  return rawBody;
}

export type VerifiedKakaoHttpRequest = Readonly<{
  rawBody: Uint8Array<ArrayBuffer>;
  intent: VerifiedKakaoWebhookIntent;
}>;

export type KakaoHttpRequestFailureCode =
  | "QUERY_FORBIDDEN"
  | "SIGNING_KEY_UNAVAILABLE"
  | "BOT_SELF_HEADER_INVALID"
  | "BODY_INVALID"
  | "ROOM_BINDING_REQUIRED"
  | "ROOM_NOT_REGISTERED"
  | "ROOM_PAUSED"
  | "ROLE_FORBIDDEN"
  | "REGISTRY_UNAVAILABLE"
  | Exclude<KakaoWebhookVerification, { ok: true }>["code"];

export type KakaoHttpRequestVerification =
  | Readonly<{ ok: true; value: VerifiedKakaoHttpRequest }>
  | Readonly<{ ok: false; code: KakaoHttpRequestFailureCode }>;

export type KakaoWebhookAuthorizationPolicy = Readonly<{
  capability: KakaoWebhookCapability;
}>;

export const PUBLIC_KAKAO_ROOM_COMMAND = Object.freeze({ capability: "PUBLIC_ROOM_COMMAND" as const });
export const TRUSTED_KAKAO_SENDER_COMMAND = Object.freeze({ capability: "TRUSTED_SENDER_COMMAND" as const });
export const INSTALLATION_KAKAO_REQUEST = Object.freeze({ capability: "INSTALLATION_ONLY" as const });

/**
 * Emits only an allowlisted reason and request metadata. Never add request
 * headers, identifiers, signatures, bodies, or environment values here.
 */
export function recordKakaoWebhookRejection(
  code: KakaoHttpRequestFailureCode,
  input: Readonly<{ route: string; traceId?: string }>,
) {
  const stage = code === "ROOM_FORBIDDEN"
    ? "ROOM"
    : code === "ROOM_BINDING_REQUIRED" || code === "ROOM_NOT_REGISTERED" || code === "ROOM_PAUSED"
      ? "ROOM_REGISTRY"
    : code === "CAPABILITY_FORBIDDEN"
      ? "CAPABILITY"
      : code === "ROLE_FORBIDDEN"
        ? "ROLE"
      : code === "BOT_SELF_MESSAGE"
        ? "SENDER"
        : "SIGNATURE";
  console.warn("KAKAO_WEBHOOK_REJECTED", {
    code,
    stage,
    route: input.route,
    traceId: input.traceId ?? null,
  });
}

/**
 * Verifies the exact raw body before JSON parsing. Durable nonce ownership is
 * deliberately claimed later, inside the application transaction that writes
 * the receipt or aggregate.
 */
export async function verifyKakaoInstallationHttpRequest(
  request: Request,
  now = new Date(),
  maximumBodyBytes = MAXIMUM_KAKAO_BODY_BYTES,
): Promise<KakaoHttpRequestVerification> {
  if (new URL(request.url).searchParams.size > 0) return { ok: false, code: "QUERY_FORBIDDEN" };
  const timestamp = request.headers.get("x-klol-timestamp");
  const timestampSeconds = timestamp && /^(?:0|[1-9][0-9]{0,12})$/u.test(timestamp) ? Number(timestamp) : -1;
  const botSelf = request.headers.get("x-klol-bot-self");
  const secrets = kakaoWebhookSecrets();
  if (!secrets) return { ok: false, code: "SIGNING_KEY_UNAVAILABLE" };
  if (botSelf !== "0" && botSelf !== "1") return { ok: false, code: "BOT_SELF_HEADER_INVALID" };
  const rawBody = await readBoundedKakaoRawBody(request, maximumBodyBytes);
  if (!rawBody) return { ok: false, code: "BODY_INVALID" };
  const verification = verifyKakaoWebhook({
    request: {
      timestampSeconds,
      nonce: request.headers.get("x-klol-nonce") ?? "",
      installationId: request.headers.get("x-klol-installation") ?? undefined,
      roomId: request.headers.get("x-klol-room") ?? "",
      senderId: request.headers.get("x-klol-sender") ?? "",
      botSelf: botSelf === "1",
      signature: request.headers.get("x-klol-signature") ?? "",
      rawBody,
    },
    now,
    secrets,
    allowedRoomIds: new Set(),
    allowedSenderIds: new Set(),
    requiredCapability: "INSTALLATION_ONLY",
    botSenderId: process.env.KAKAO_WEBHOOK_BOT_SENDER_ID ?? "",
    nonceAlreadyUsed: false,
    maximumBodyBytes,
  });
  return verification.ok
    ? { ok: true, value: Object.freeze({ rawBody, intent: verification.intent }) }
    : verification;
}

export async function verifyKakaoHttpRequest(
  request: Request,
  now = new Date(),
  maximumBodyBytes = MAXIMUM_KAKAO_BODY_BYTES,
  policy: KakaoWebhookAuthorizationPolicy = TRUSTED_KAKAO_SENDER_COMMAND,
): Promise<KakaoHttpRequestVerification> {
  const installation = await verifyKakaoInstallationHttpRequest(request, now, maximumBodyBytes);
  if (!installation.ok) return installation;
  const { getRuntimeKakaoRoomRegistry } = await import("../kakao-access/runtime");
  const registry = getRuntimeKakaoRoomRegistry();
  if (!registry) return { ok: false, code: "REGISTRY_UNAVAILABLE" };
  try {
    const authorization = await registry.authorize({
      installationPublicId: installation.value.intent.installationId ?? legacyKakaoInstallationId(installation.value.intent.keyId),
      localRoomFingerprint: installation.value.intent.roomId,
      senderFingerprint: installation.value.intent.senderId,
      requiredRole: policy.capability === "TRUSTED_SENDER_COMMAND" ? "ADMIN" : "MEMBER",
    });
    return { ok: true, value: Object.freeze({
      rawBody: installation.value.rawBody,
      intent: Object.freeze({ ...installation.value.intent, localRoomFingerprint: installation.value.intent.roomId, roomId: authorization.roomId }),
    }) };
  } catch (error) {
    if (error instanceof KakaoRoomRegistryError) {
      if (error.code === "ROOM_BINDING_REQUIRED") return { ok: false, code: "ROOM_BINDING_REQUIRED" };
      if (error.code === "ROOM_NOT_REGISTERED") return { ok: false, code: "ROOM_NOT_REGISTERED" };
      if (error.code === "ROOM_PAUSED") return { ok: false, code: "ROOM_PAUSED" };
      if (error.code === "ROLE_FORBIDDEN") return { ok: false, code: "ROLE_FORBIDDEN" };
    }
    return { ok: false, code: "REGISTRY_UNAVAILABLE" };
  }
}

export async function readVerifiedKakaoHttpRequest(
  request: Request,
  now = new Date(),
  maximumBodyBytes = MAXIMUM_KAKAO_BODY_BYTES,
): Promise<VerifiedKakaoHttpRequest | null> {
  const result = await verifyKakaoHttpRequest(request, now, maximumBodyBytes);
  return result.ok ? result.value : null;
}
