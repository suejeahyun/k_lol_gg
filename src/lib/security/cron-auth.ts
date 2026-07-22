import { safeEqualText } from "@/lib/security/hmac";

const MIN_CRON_SECRET_LENGTH = 16;

export function isCronRequestAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (expected.length < MIN_CRON_SECRET_LENGTH) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.replace(/^Bearer\s+/i, "").trim();
  return received.length > 0 && safeEqualText(received, expected);
}

export function isCronConfigured() {
  return (process.env.CRON_SECRET?.trim().length ?? 0) >= MIN_CRON_SECRET_LENGTH;
}
