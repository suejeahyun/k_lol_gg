import type { KakaoWebhookSecret } from "./kakao-signature";

export const MAXIMUM_KAKAO_BODY_BYTES = 256 * 1_024;

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

export async function readBoundedKakaoRawBody(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^[1-9][0-9]{0,6}$/u.test(declared) || Number(declared) > MAXIMUM_KAKAO_BODY_BYTES)) return null;
  if (!request.body || request.bodyUsed) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.byteLength;
      if (length > MAXIMUM_KAKAO_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(item.value);
    }
  } catch { return null; } finally { reader.releaseLock(); }
  if (length < 2 || (declared && Number(declared) !== length)) return null;
  const rawBody = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { rawBody.set(chunk, offset); offset += chunk.byteLength; }
  return rawBody;
}
