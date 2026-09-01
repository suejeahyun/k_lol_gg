const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const TRACEPARENT_V00_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

function isNonZeroHex(value: string) {
  return !/^0+$/.test(value);
}

export function validateTraceId(value: unknown): string | undefined {
  if (typeof value !== "string" || !TRACE_ID_PATTERN.test(value) || !isNonZeroHex(value)) {
    return undefined;
  }

  return value.toLowerCase();
}

export function traceIdFromTraceparent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const match = TRACEPARENT_V00_PATTERN.exec(value);
  if (!match) return undefined;

  const [, traceId, parentId] = match;
  if (!isNonZeroHex(parentId)) return undefined;

  return validateTraceId(traceId);
}

export function readValidatedTraceId(headers: Headers): string | undefined {
  const traceparent = headers.get("traceparent");
  if (traceparent !== null) return traceIdFromTraceparent(traceparent);

  return validateTraceId(headers.get("x-trace-id"));
}
