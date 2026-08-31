import { safeEqualText } from "@/lib/security/hmac";

const ROTATING_SECRET_NEXT_KEY = {
  KAKAO_RECRUIT_SECRET: "KAKAO_RECRUIT_SECRET_NEXT",
  KAKAO_SEARCH_PLAYER_SECRET: "KAKAO_SEARCH_PLAYER_SECRET_NEXT",
} as const;

type RotatingSecretName = keyof typeof ROTATING_SECRET_NEXT_KEY;

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

function isRotatingSecretName(name: string): name is RotatingSecretName {
  return Object.prototype.hasOwnProperty.call(ROTATING_SECRET_NEXT_KEY, name);
}

export function getSecretCandidates(name: string) {
  const active = getOptionalSecret(name);
  if (!isRotatingSecretName(name)) return active ? [active] : [];

  const nextName = ROTATING_SECRET_NEXT_KEY[name];
  const nextConfigured = Object.prototype.hasOwnProperty.call(process.env, nextName);
  const next = getOptionalSecret(nextName);
  const invalidRotation = nextConfigured && (!active || !next || safeEqualText(active, next));

  // Production must not silently fall back to one key when an explicitly
  // configured overlap is malformed. The deployment validator reports the
  // configuration error before release; this is the runtime fail-closed path.
  if (invalidRotation && process.env.NODE_ENV === "production") return [];

  const values = [active, next].filter((value): value is string => Boolean(value));
  return values.filter((value, index) => values.findIndex((item) => safeEqualText(item, value)) === index);
}

export function getRequiredSecretCandidatesInProduction(name: RotatingSecretName) {
  const values = getSecretCandidates(name);

  if (values.length === 0 && process.env.NODE_ENV === "production") {
    throw new Error(`${name} 환경변수 구성이 올바르지 않습니다.`);
  }

  return values;
}

export function matchesSecret(
  expected: string | Array<string | null | undefined> | null | undefined,
  candidates: Array<string | null | undefined>,
) {
  const expectedValues = (Array.isArray(expected) ? expected : [expected])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const receivedValues = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (expectedValues.length === 0 || receivedValues.length === 0) return false;

  let matched = 0;
  for (const expectedValue of expectedValues) {
    for (const receivedValue of receivedValues) {
      matched |= Number(safeEqualText(receivedValue, expectedValue));
    }
  }
  return matched === 1;
}

export function matchesRequestSecret(
  expected: string | Array<string | null | undefined> | null | undefined,
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
