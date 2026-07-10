import { safeEqualText } from "@/lib/security/hmac";

export function getOptionalSecret(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getRequiredSecret(name: string) {
  const value = getOptionalSecret(name);

  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

export function allowQueryStringSecret() {
  return process.env.SECURITY_ALLOW_QUERY_SECRET === "true" || process.env.NODE_ENV !== "production";
}

export function matchesSecret(expected: string | null | undefined, candidates: Array<string | null | undefined>) {
  if (!expected) return false;

  return candidates.some((candidate) => {
    const received = candidate?.trim();
    return Boolean(received) && safeEqualText(received!, expected);
  });
}

export function matchesRequestSecret(
  expected: string | null | undefined,
  candidates: {
    headers?: Array<string | null | undefined>;
    bearer?: string | null | undefined;
    body?: string | null | undefined;
    query?: string | null | undefined;
  },
) {
  const values = [
    ...(candidates.headers ?? []),
    candidates.bearer,
    candidates.body,
    allowQueryStringSecret() ? candidates.query : null,
  ];

  return matchesSecret(expected, values);
}

export function getRequiredSecretInProduction(name: string) {
  const value = getOptionalSecret(name);

  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}
