const KAKAO_REQUEST_ID_MAX_LENGTH = 160;

export function normalizeKakaoRequestId(value: unknown) {
  if (typeof value !== "string") return null;

  const requestId = value.trim();
  if (requestId.length < 8 || requestId.length > KAKAO_REQUEST_ID_MAX_LENGTH) {
    return null;
  }

  return /^[A-Za-z0-9:._-]+$/.test(requestId) ? requestId : null;
}
