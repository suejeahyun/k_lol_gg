import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { KakaoWebhookSecret } from "../infrastructure/kakao-signature";
import type { KakaoRoomCapabilityProfile } from "../kakao-access/domain";

export const KAKAO_V4_COMMAND_CONTRACT = "KLOL_KAKAO_COMMAND_V4";
export const KAKAO_V4_V1_CONTRACT = "KLOL_KAKAO_V4_V1_COMPAT_2026_09_10_R1";
export const KAKAO_V1_STRICT_PROTOCOL = "KLOL_KAKAO_V1_STRICT";
export const KAKAO_V1_STRICT_RESPONSE_FORMAT = "V1_SERVER_EXACT";
export const KAKAO_V4_MAXIMUM_BODY_BYTES = 32 * 1_024;
export const KAKAO_V4_MAXIMUM_TEXT_LENGTH = 20_000;
export const KAKAO_V4_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type KakaoV4ProfileId = KakaoRoomCapabilityProfile;

type KakaoV4CommandEnvelopeBase = Readonly<{
  profileId: KakaoV4ProfileId;
  installationId: string;
  senderId: string;
  eventId: string;
  timestamp: number;
  nonce: string;
  text: string;
}>;

export type KakaoV4CommandEnvelope = KakaoV4CommandEnvelopeBase & (
  | Readonly<{ protocol?: never; responseFormat?: never }>
  | Readonly<{
      protocol: typeof KAKAO_V1_STRICT_PROTOCOL;
      responseFormat: typeof KAKAO_V1_STRICT_RESPONSE_FORMAT;
    }>
);

export type KakaoV4SignatureFailure =
  | "SIGNING_KEY_UNAVAILABLE"
  | "SIGNING_KEY_UNKNOWN"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_STALE";

const INSTALLATION_PATTERN = /^install-[a-f0-9]{32}$/u;
const SENDER_PATTERN = /^sender-(?:user|display)-[a-f0-9]{32}$/u;
const EVENT_PATTERN = /^event-[A-Za-z0-9._:-]{8,121}$/u;
const NONCE_PATTERN = /^[a-f0-9]{32}$/u;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
const SIGNATURE_PATTERN = /^v4=([a-f0-9]{64})$/u;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

export function parseKakaoV4CommandEnvelope(value: unknown): KakaoV4CommandEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const baseKeys = ["profileId", "installationId", "senderId", "eventId", "timestamp", "nonce", "text"] as const;
  const v1Strict = hasExactKeys(body, [...baseKeys, "protocol", "responseFormat"]);
  if (!hasExactKeys(body, baseKeys) && !v1Strict) return null;
  if (v1Strict && (
    body.protocol !== KAKAO_V1_STRICT_PROTOCOL ||
    body.responseFormat !== KAKAO_V1_STRICT_RESPONSE_FORMAT
  )) return null;
  if (body.profileId !== "RECRUIT" && body.profileId !== "FEATURES") return null;
  if (typeof body.installationId !== "string" || !INSTALLATION_PATTERN.test(body.installationId)) return null;
  if (typeof body.senderId !== "string" || !SENDER_PATTERN.test(body.senderId)) return null;
  if (typeof body.eventId !== "string" || !EVENT_PATTERN.test(body.eventId)) return null;
  if (!Number.isSafeInteger(body.timestamp) || (body.timestamp as number) <= 0) return null;
  if (typeof body.nonce !== "string" || !NONCE_PATTERN.test(body.nonce)) return null;
  if (typeof body.text !== "string" || body.text.length < 1 || body.text.length > KAKAO_V4_MAXIMUM_TEXT_LENGTH) return null;
  const envelopeBase: KakaoV4CommandEnvelopeBase = Object.freeze({
    profileId: body.profileId,
    installationId: body.installationId,
    senderId: body.senderId,
    eventId: body.eventId,
    timestamp: body.timestamp as number,
    nonce: body.nonce,
    text: body.text,
  });
  return v1Strict
    ? Object.freeze({
      ...envelopeBase,
      protocol: KAKAO_V1_STRICT_PROTOCOL,
      responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
    })
    : envelopeBase;
}

export function usesKakaoV1StrictResponse(envelope: KakaoV4CommandEnvelope) {
  return envelope.protocol === KAKAO_V1_STRICT_PROTOCOL &&
    envelope.responseFormat === KAKAO_V1_STRICT_RESPONSE_FORMAT;
}

export function canonicalKakaoV4CommandText(value: string) {
  const text = value.trim();
  if (!text || text === "/" || text.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return null;
  if (!text.includes("\n") && text.indexOf("/") > 0) return null;
  if (!text.startsWith("/")) return text;
  const stripped = text.slice(1);
  return !stripped || /^\s/u.test(stripped) ? null : stripped;
}

export function kakaoV4RequestDigestHex(rawBody: Uint8Array) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function kakaoV4SignatureMaterial(keyId: string, bodyDigestHex: string) {
  return [KAKAO_V4_COMMAND_CONTRACT, keyId, bodyDigestHex].join("\n");
}

export function verifyKakaoV4Signature(input: Readonly<{
  envelope: KakaoV4CommandEnvelope;
  rawBody: Uint8Array;
  keyId: string;
  signature: string;
  secrets: readonly KakaoWebhookSecret[] | null;
  now?: Date;
}>): Readonly<{ ok: true; requestDigestHex: string }> | Readonly<{ ok: false; code: KakaoV4SignatureFailure }> {
  if (!input.secrets) return { ok: false, code: "SIGNING_KEY_UNAVAILABLE" };
  if (!KEY_ID_PATTERN.test(input.keyId)) return { ok: false, code: "SIGNING_KEY_UNKNOWN" };
  const secret = input.secrets.find((candidate) => candidate.keyId === input.keyId);
  if (!secret) return { ok: false, code: "SIGNING_KEY_UNKNOWN" };
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (Math.abs(nowSeconds - input.envelope.timestamp) > KAKAO_V4_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, code: "TIMESTAMP_STALE" };
  }
  const match = SIGNATURE_PATTERN.exec(input.signature);
  if (!match) return { ok: false, code: "SIGNATURE_INVALID" };
  const requestDigestHex = kakaoV4RequestDigestHex(input.rawBody);
  const expected = createHmac("sha256", secret.secret)
    .update(kakaoV4SignatureMaterial(input.keyId, requestDigestHex))
    .digest();
  const supplied = Buffer.from(match[1]!, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? { ok: true, requestDigestHex }
    : { ok: false, code: "SIGNATURE_INVALID" };
}
