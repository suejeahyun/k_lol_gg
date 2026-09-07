import { verifyKakaoWebhook, type KakaoWebhookSecret, type VerifiedKakaoWebhookIntent } from "./kakao-signature";

export const MAXIMUM_KAKAO_BODY_BYTES = 256 * 1_024;
export const MAXIMUM_KAKAO_IMAGE_BODY_BYTES = 4_200_000;

export function splitKakaoIdentifiers(value: string | undefined) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
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

/**
 * Verifies the exact raw body before JSON parsing. Durable nonce ownership is
 * deliberately claimed later, inside the application transaction that writes
 * the receipt or aggregate.
 */
export async function readVerifiedKakaoHttpRequest(
  request: Request,
  now = new Date(),
  maximumBodyBytes = MAXIMUM_KAKAO_BODY_BYTES,
): Promise<VerifiedKakaoHttpRequest | null> {
  if (new URL(request.url).searchParams.size > 0) return null;
  const timestamp = request.headers.get("x-klol-timestamp");
  const timestampSeconds = timestamp && /^(?:0|[1-9][0-9]{0,12})$/u.test(timestamp) ? Number(timestamp) : -1;
  const botSelf = request.headers.get("x-klol-bot-self");
  const secrets = kakaoWebhookSecrets();
  const rawBody = await readBoundedKakaoRawBody(request, maximumBodyBytes);
  if (!secrets || !rawBody || (botSelf !== "0" && botSelf !== "1")) return null;
  const verification = verifyKakaoWebhook({
    request: {
      timestampSeconds,
      nonce: request.headers.get("x-klol-nonce") ?? "",
      roomId: request.headers.get("x-klol-room") ?? "",
      senderId: request.headers.get("x-klol-sender") ?? "",
      botSelf: botSelf === "1",
      signature: request.headers.get("x-klol-signature") ?? "",
      rawBody,
    },
    now,
    secrets,
    allowedRoomIds: splitKakaoIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS),
    allowedSenderIds: splitKakaoIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS),
    botSenderId: process.env.KAKAO_WEBHOOK_BOT_SENDER_ID ?? "",
    nonceAlreadyUsed: false,
    maximumBodyBytes,
  });
  return verification.ok ? Object.freeze({ rawBody, intent: verification.intent }) : null;
}
