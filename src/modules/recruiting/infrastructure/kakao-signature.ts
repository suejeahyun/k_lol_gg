import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type KakaoWebhookRequest = Readonly<{
  timestampSeconds: number;
  nonce: string;
  installationId?: string;
  reportedKeyId?: string;
  deliveryId?: string;
  botVersion?: string;
  roomId: string;
  senderId: string;
  botSelf: boolean;
  signature: string;
  rawBody: Uint8Array;
}>;

export type KakaoWebhookSecret = Readonly<{
  keyId: string;
  secret: Uint8Array;
}>;

export type VerifiedKakaoWebhookIntent = Readonly<{
  kind: "KAKAO_HMAC";
  keyId: string;
  timestampSeconds: number;
  nonce: string;
  installationId?: string;
  deliveryId?: string;
  botVersion?: string;
  localRoomFingerprint?: string;
  roomId: string;
  senderId: string;
  bodyDigestHex: string;
  requireNonceClaim: true;
  transactionRecheck: true;
}>;

export type KakaoWebhookCapability = "INSTALLATION_ONLY" | "PUBLIC_ROOM_COMMAND" | "TRUSTED_SENDER_COMMAND";

export type KakaoWebhookVerification =
  | Readonly<{ ok: true; intent: VerifiedKakaoWebhookIntent }>
  | Readonly<{ ok: false; code: "INVALID_SIGNATURE" | "EXPIRED_TIMESTAMP" | "REPLAYED_NONCE" | "ROOM_FORBIDDEN" | "CAPABILITY_FORBIDDEN" | "BOT_SELF_MESSAGE" | "INVALID_REQUEST" }>;

const MAXIMUM_SKEW_SECONDS = 5 * 60;

function safeIdentifier(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(value);
}

export function kakaoWebhookBodyDigest(rawBody: Uint8Array) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function legacyKakaoInstallationId(keyId: string) {
  return `install-${createHash("sha256").update(`klol-v2:legacy-installation:v1\0${keyId}`).digest("hex").slice(0, 32)}`;
}

export function installationScopedRoomId(installationId: string) {
  return `room-${createHash("sha256").update(`klol-v2:kakao-installation-room-scope:v1\0${installationId}`).digest("hex").slice(0, 32)}`;
}

function signatureMaterial(request: Omit<KakaoWebhookRequest, "signature" | "botSelf" | "rawBody">, bodyDigestHex: string) {
  if (request.installationId && request.reportedKeyId && request.deliveryId && request.botVersion) {
    return ["KLOL_KAKAO_WEBHOOK_V3", request.timestampSeconds, request.nonce, request.installationId, request.reportedKeyId, request.deliveryId, request.botVersion, request.roomId, request.senderId, bodyDigestHex].join("\n");
  }
  return request.installationId
    ? ["KLOL_KAKAO_WEBHOOK_V2", request.timestampSeconds, request.nonce, request.installationId, request.roomId, request.senderId, bodyDigestHex].join("\n")
    : ["KLOL_KAKAO_WEBHOOK_V1", request.timestampSeconds, request.nonce, request.roomId, request.senderId, bodyDigestHex].join("\n");
}

export function signKakaoWebhookForFixture(
  request: Omit<KakaoWebhookRequest, "signature" | "botSelf">,
  secret: Uint8Array,
) {
  const digest = kakaoWebhookBodyDigest(request.rawBody);
  const version = request.installationId && request.reportedKeyId && request.deliveryId && request.botVersion ? "v3" : request.installationId ? "v2" : "v1";
  return `${version}=${createHmac("sha256", secret).update(signatureMaterial(request, digest)).digest("hex")}`;
}

export function verifyKakaoWebhook(input: Readonly<{
  request: KakaoWebhookRequest;
  now: Date;
  secrets: readonly KakaoWebhookSecret[];
  allowedRoomIds: ReadonlySet<string>;
  allowedSenderIds: ReadonlySet<string>;
  requiredCapability?: KakaoWebhookCapability;
  botSenderId: string;
  nonceAlreadyUsed: boolean;
  maximumSkewSeconds?: number;
  maximumBodyBytes?: number;
}>): KakaoWebhookVerification {
  const { request } = input;
  const maximumSkewSeconds = input.maximumSkewSeconds ?? MAXIMUM_SKEW_SECONDS;
  const maximumBodyBytes = input.maximumBodyBytes ?? 256 * 1_024;
  const requiredCapability = input.requiredCapability ?? "TRUSTED_SENDER_COMMAND";
  if (
    !Number.isSafeInteger(request.timestampSeconds) || request.timestampSeconds < 0 ||
    !Number.isFinite(input.now.getTime()) ||
    !Number.isSafeInteger(maximumSkewSeconds) || maximumSkewSeconds < 1 || maximumSkewSeconds > 900 ||
    !/^[A-Za-z0-9_-]{16,100}$/u.test(request.nonce) ||
    (request.installationId !== undefined && !safeIdentifier(request.installationId)) ||
    (request.reportedKeyId !== undefined && !safeIdentifier(request.reportedKeyId)) ||
    (request.deliveryId !== undefined && !/^delivery-[a-f0-9]{32}$/u.test(request.deliveryId)) ||
    (request.botVersion !== undefined && (!safeIdentifier(request.botVersion) || request.botVersion.length < 8)) ||
    !safeIdentifier(request.roomId) || !safeIdentifier(request.senderId) ||
    !safeIdentifier(input.botSenderId) ||
    !Number.isSafeInteger(maximumBodyBytes) || maximumBodyBytes < 2 || maximumBodyBytes > 4_200_000 ||
    !(request.rawBody instanceof Uint8Array) || request.rawBody.byteLength < 2 || request.rawBody.byteLength > maximumBodyBytes ||
    input.secrets.length < 1 || input.secrets.length > 2 ||
    new Set(input.secrets.map((entry) => entry.keyId)).size !== input.secrets.length ||
    input.secrets.some((entry) => !safeIdentifier(entry.keyId) || !(entry.secret instanceof Uint8Array) || entry.secret.byteLength < 32) ||
    !["INSTALLATION_ONLY", "PUBLIC_ROOM_COMMAND", "TRUSTED_SENDER_COMMAND"].includes(requiredCapability)
  ) return { ok: false, code: "INVALID_REQUEST" };
  if (Math.abs(Math.floor(input.now.getTime() / 1_000) - request.timestampSeconds) > maximumSkewSeconds) {
    return { ok: false, code: "EXPIRED_TIMESTAMP" };
  }
  if (input.nonceAlreadyUsed) return { ok: false, code: "REPLAYED_NONCE" };

  const hasV3Fields = Boolean(request.installationId && request.reportedKeyId && request.deliveryId && request.botVersion);
  const hasPartialV3Fields = Boolean(request.reportedKeyId || request.deliveryId || request.botVersion) && !hasV3Fields;
  if (hasPartialV3Fields) return { ok: false, code: "INVALID_REQUEST" };
  const expectedVersion = hasV3Fields ? "v3" : request.installationId ? "v2" : "v1";
  const signatureMatch = /^(v1|v2|v3)=([a-f0-9]{64})$/u.exec(request.signature);
  if (signatureMatch?.[1] !== expectedVersion) return { ok: false, code: "INVALID_SIGNATURE" };
  if (!signatureMatch) return { ok: false, code: "INVALID_SIGNATURE" };
  const bodyDigestHex = kakaoWebhookBodyDigest(request.rawBody);
  const supplied = Buffer.from(signatureMatch[2]!, "hex");
  let matchedKeyId: string | null = null;
  let matchedSecret: Uint8Array | null = null;
  for (const entry of input.secrets) {
    const expected = createHmac("sha256", entry.secret)
      .update(signatureMaterial(request, bodyDigestHex))
      .digest();
    if (timingSafeEqual(expected, supplied)) { matchedKeyId = entry.keyId; matchedSecret = entry.secret; }
  }
  if (!matchedKeyId || !matchedSecret) return { ok: false, code: "INVALID_SIGNATURE" };
  if (request.reportedKeyId && request.reportedKeyId !== matchedKeyId) return { ok: false, code: "INVALID_SIGNATURE" };
  if (hasV3Fields && request.installationId && request.roomId !== installationScopedRoomId(request.installationId)) return { ok: false, code: "INVALID_SIGNATURE" };
  if (request.botSelf || request.senderId === input.botSenderId) return { ok: false, code: "BOT_SELF_MESSAGE" };
  if (requiredCapability === "INSTALLATION_ONLY") {
    return {
      ok: true,
      intent: Object.freeze({
        kind: "KAKAO_HMAC", keyId: matchedKeyId, timestampSeconds: request.timestampSeconds,
        nonce: request.nonce, installationId: request.installationId ?? legacyKakaoInstallationId(matchedKeyId),
        deliveryId: request.deliveryId, botVersion: request.botVersion,
        roomId: request.roomId, senderId: request.senderId, bodyDigestHex,
        requireNonceClaim: true, transactionRecheck: true,
      }),
    };
  }
  if (!input.allowedRoomIds.has(request.roomId)) return { ok: false, code: "ROOM_FORBIDDEN" };
  if (requiredCapability === "TRUSTED_SENDER_COMMAND" && !input.allowedSenderIds.has(request.senderId)) {
    return { ok: false, code: "CAPABILITY_FORBIDDEN" };
  }
  return {
    ok: true,
    intent: Object.freeze({
      kind: "KAKAO_HMAC",
      keyId: matchedKeyId,
      timestampSeconds: request.timestampSeconds,
      nonce: request.nonce,
      installationId: request.installationId ?? legacyKakaoInstallationId(matchedKeyId),
      deliveryId: request.deliveryId,
      botVersion: request.botVersion,
      roomId: request.roomId,
      senderId: request.senderId,
      bodyDigestHex,
      requireNonceClaim: true,
      transactionRecheck: true,
    }),
  };
}
