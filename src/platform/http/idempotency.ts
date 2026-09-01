const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:+/=-]{15,127}$/;
const IDEMPOTENCY_SCOPE_PATTERN = /^[a-z][a-z0-9._:/-]{2,127}$/;
const HASH_DOMAIN = "klol-v2:idempotency:v1";

export type ParsedIdempotencyKey = Readonly<{
  normalized: string;
}>;

export type IdempotencyKeyResult =
  | { ok: true; key: ParsedIdempotencyKey }
  | { ok: false; error: "INVALID" | "MISSING" };

export function readIdempotencyKey(headers: Headers): IdempotencyKeyResult {
  const rawValue = headers.get("idempotency-key");
  if (rawValue === null) return { ok: false, error: "MISSING" };
  if (!IDEMPOTENCY_KEY_PATTERN.test(rawValue)) return { ok: false, error: "INVALID" };

  return { ok: true, key: Object.freeze({ normalized: rawValue }) };
}

export function idempotencyHashMaterial(key: ParsedIdempotencyKey, scope: string) {
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key.normalized)) {
    throw new TypeError("idempotency key is invalid");
  }
  if (!IDEMPOTENCY_SCOPE_PATTERN.test(scope)) {
    throw new TypeError("idempotency scope must be a stable lower-case identifier");
  }

  return new TextEncoder().encode(`${HASH_DOMAIN}\0${scope}\0${key.normalized}`);
}
