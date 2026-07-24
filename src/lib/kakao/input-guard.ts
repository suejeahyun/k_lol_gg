export const MAX_KAKAO_MESSAGE_LENGTH = 20_000;
export const MAX_KAKAO_IDENTITY_LENGTH = 200;
export const MAX_KAKAO_NAME_LENGTH = 80;

export function getKakaoMessageValidationError(message: string) {
  if (!message.trim()) return "메시지가 비어 있습니다.";
  if (message.length > MAX_KAKAO_MESSAGE_LENGTH) {
    return `양식이 너무 깁니다. ${MAX_KAKAO_MESSAGE_LENGTH.toLocaleString("ko-KR")}자 이하로 보내주세요.`;
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) {
    return "양식에 처리할 수 없는 제어 문자가 포함되어 있습니다.";
  }
  return null;
}

export function isKakaoNameTooLong(value: string | null | undefined) {
  return String(value || "").trim().length > MAX_KAKAO_NAME_LENGTH;
}

export function normalizeKakaoIdentity(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F]/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, MAX_KAKAO_IDENTITY_LENGTH);
}
